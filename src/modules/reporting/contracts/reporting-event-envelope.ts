import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ReportingProjectionError } from "@/modules/reporting/domain/reporting-projection-error";

const scalarAttributeSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const dimensionReferenceSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
});

const eventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().min(1),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  aggregateVersion: z.number().int().positive().nullable(),
  schemaVersion: z.number().int().positive(),
  occurredAt: z.string().min(1),
  actor: z.object({
    type: z.enum(["USER", "STAFF", "SYSTEM"]),
    id: z.string().nullable(),
  }),
  sourceType: z.enum(["HUMAN", "AUTOMATION", "MIGRATION"]),
  scope: z.object({
    partyId: z.string().nullable(),
    organizationId: z.string().nullable(),
  }),
  correlationId: z.string().uuid().nullable(),
  causationId: z.string().uuid().nullable(),
  payload: z.object({
    fromStatus: z.string().nullable(),
    toStatus: z.string().nullable(),
    dimensions: z.object({
      snapshotStatus: z.enum([
        "COMPLETE",
        "INCOMPLETE",
        "HISTORICAL_INCOMPLETE",
      ]),
      partyType: z.enum(["INDIVIDUAL", "ORGANIZATION"]).nullable().optional(),
      legacyImported: z.boolean().or(z.literal(0)).or(z.literal(1)).optional(),
      channel: z.string().nullable().optional(),
      priority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]).nullable().optional(),
      routeVersion: z.number().int().positive().nullable().optional(),
      ownerUserId: z.string().nullable().optional(),
      rootCauseRecorded: z.boolean().optional(),
      partyKeyHash: z.string().length(64).regex(/^[a-f0-9]+$/).nullable().optional(),
      normalizedRootCause: dimensionReferenceSchema.nullable().optional(),
      incidentKey: z.string().min(1).max(64).nullable().optional(),
      service: dimensionReferenceSchema.nullable().optional(),
      requestType: dimensionReferenceSchema.nullable().optional(),
      supportTeam: dimensionReferenceSchema.nullable().optional(),
      queue: dimensionReferenceSchema.nullable().optional(),
      slaPolicy: z
        .object({
          code: z.string().min(1),
          version: z.number().int().positive(),
          clockType: z.enum(["CALENDAR", "BUSINESS"]),
          enforcementMode: z.enum(["OBSERVE_ONLY", "ENFORCED"]),
          startedAt: z.string().min(1).optional(),
          firstResponseDueAt: z.string().min(1).optional(),
          resolutionDueAt: z.string().min(1).optional(),
          firstResponseState: z
            .enum(["PENDING", "PAUSED", "MET", "BREACHED", "NOT_APPLICABLE"])
            .optional(),
          resolutionState: z
            .enum(["PENDING", "PAUSED", "MET", "BREACHED", "NOT_APPLICABLE"])
            .optional(),
        })
        .nullable()
        .optional(),
    }),
    attributes: z.record(z.string(), scalarAttributeSchema),
  }),
});

export type ReportingEventEnvelope = z.infer<typeof eventEnvelopeSchema> & {
  occurredAtDate: Date;
};

export type ReportingOutboxEvent = {
  id: bigint;
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  schemaVersion: number;
  payload: Prisma.JsonValue;
  occurredAt: Date;
};

function invalidEnvelope(message: string, cause?: unknown): ReportingProjectionError {
  return new ReportingProjectionError(message, "INVALID_EVENT_ENVELOPE", {
    cause,
  });
}

export function parseReportingEventEnvelope(
  event: ReportingOutboxEvent
): ReportingEventEnvelope {
  const parsed = eventEnvelopeSchema.safeParse(event.payload);
  if (!parsed.success) {
    throw invalidEnvelope("Reporting event envelope is invalid", parsed.error);
  }

  const envelope = parsed.data;
  const occurredAtDate = new Date(envelope.occurredAt);
  if (Number.isNaN(occurredAtDate.getTime())) {
    throw invalidEnvelope("Reporting event occurredAt is invalid");
  }
  if (event.schemaVersion !== 1 || envelope.schemaVersion !== 1) {
    throw new ReportingProjectionError(
      `Unsupported reporting event schema version: ${event.schemaVersion}`,
      "UNSUPPORTED_EVENT_SCHEMA"
    );
  }
  if (
    envelope.eventId !== event.eventId ||
    envelope.eventType !== event.eventType ||
    envelope.aggregateId !== event.aggregateId ||
    envelope.aggregateType.toUpperCase() !== event.aggregateType.toUpperCase() ||
    occurredAtDate.getTime() !== event.occurredAt.getTime()
  ) {
    throw invalidEnvelope("Reporting event envelope does not match its outbox record");
  }

  return { ...envelope, occurredAtDate };
}

export function parseInternalNumericId(
  value: string | null | undefined,
  fieldName: string
): number | null {
  if (value === null || value === undefined) return null;
  if (!/^\d+$/.test(value)) {
    throw invalidEnvelope(`${fieldName} must be a positive internal identifier`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw invalidEnvelope(`${fieldName} exceeds the supported identifier range`);
  }
  return parsed;
}

export function parseOptionalEventDate(
  value: string | undefined,
  fieldName: string
): Date | null {
  if (value === undefined) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw invalidEnvelope(`${fieldName} must be an ISO-8601 timestamp`);
  }
  return parsed;
}

export function isHistoricalIncompleteEvent(
  event: ReportingEventEnvelope
): boolean {
  return (
    event.aggregateVersion === null ||
    event.payload.dimensions.snapshotStatus === "HISTORICAL_INCOMPLETE"
  );
}
