import { randomUUID } from "node:crypto";
import { Prisma, type TicketEventVisibility, type TicketLifecycleStatus } from "@prisma/client";
import {
  ROUTING_EVENT_TYPES,
  SLA_EVENT_TYPES,
  TICKET_EVENT_TYPES,
  type TicketDomainEventType,
  type TicketEventActorType,
  type TicketEventSourceType,
  requireTicketDomainEventType,
} from "@/modules/tickets/contracts/ticket-domain-events";
import { hashSecurityValue } from "@/lib/request-security";

const EVENT_SCHEMA_VERSION = 1;

type AppendTicketEventInput = {
  ticketInternalId: number;
  ticketPublicId: string;
  type: TicketDomainEventType;
  actorType: TicketEventActorType;
  sourceType: TicketEventSourceType;
  visibility?: TicketEventVisibility;
  fromStatus?: TicketLifecycleStatus | null;
  toStatus?: TicketLifecycleStatus | null;
  actorUserId?: number | null;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
  aggregateVersion?: number;
  correlationId?: string | null;
  causationId?: string | null;
};

type SafeAttribute = string | number | boolean | null;

const safeAttributeKeys: Readonly<Record<TicketDomainEventType, readonly string[]>> = {
  [TICKET_EVENT_TYPES.IMPORTED]: ["legacyStatus", "legacyImported"],
  [TICKET_EVENT_TYPES.CREATED]: ["requestTypeCode", "routeVersion", "adapter", "quarantined"],
  [TICKET_EVENT_TYPES.ROUTED]: ["requestTypeId", "supportTeamId", "queueId", "routeVersion", "priority", "adapter", "quarantined"],
  [TICKET_EVENT_TYPES.ASSIGNED]: ["ownerUserId"],
  [TICKET_EVENT_TYPES.TRANSFERRED]: ["fromQueueId", "toQueueId", "fromSupportTeamId", "toSupportTeamId", "requestTypeId", "routeVersion", "adapter", "quarantined"],
  [TICKET_EVENT_TYPES.PRIORITY_CHANGED]: ["fromPriority", "toPriority", "slaSnapshotPreserved"],
  [TICKET_EVENT_TYPES.STATUS_CHANGED]: ["source"],
  [TICKET_EVENT_TYPES.PUBLIC_MESSAGE_ADDED]: ["source", "adapter"],
  [TICKET_EVENT_TYPES.INTERNAL_NOTE_ADDED]: ["source"],
  [TICKET_EVENT_TYPES.CUSTOMER_INPUT_REQUESTED]: ["source"],
  [TICKET_EVENT_TYPES.CUSTOMER_REPLIED]: ["source", "adapter"],
  [TICKET_EVENT_TYPES.RESOLVED]: [],
  [TICKET_EVENT_TYPES.RESOLUTION_CONFIRMED]: ["source"],
  [TICKET_EVENT_TYPES.RESOLUTION_REJECTED]: ["source"],
  [TICKET_EVENT_TYPES.CLOSED]: ["source", "reminderCount", "adapter", "legacyStatus"],
  [TICKET_EVENT_TYPES.REOPENED]: ["source", "adapter", "legacyStatus"],
  [TICKET_EVENT_TYPES.RATED]: ["rating", "source", "adapter"],
  [TICKET_EVENT_TYPES.BUSINESS_REFERENCE_LINKED]: ["referenceType"],
  [TICKET_EVENT_TYPES.COLLABORATOR_ADDED]: ["workItemId", "supportTeamId", "queueId", "primaryOwnerPreserved"],
  [TICKET_EVENT_TYPES.COLLABORATION_COMPLETED]: ["workItemId", "supportTeamId"],
  [TICKET_EVENT_TYPES.COLLABORATION_CANCELLED]: ["workItemId", "supportTeamId"],
  [TICKET_EVENT_TYPES.MERGED]: ["sourceTicketId", "targetTicketId"],
  [TICKET_EVENT_TYPES.RESOLUTION_REMINDER]: ["reminder", "autoCloseAt"],
  [SLA_EVENT_TYPES.STARTED]: ["policyCode", "policyVersion", "clockType", "enforcementMode", "legacyExcluded"],
  [SLA_EVENT_TYPES.PAUSED]: ["reason"],
  [SLA_EVENT_TYPES.RESUMED]: ["reason", "effectivePauseMilliseconds"],
  [SLA_EVENT_TYPES.RESOLUTION_RESTARTED]: ["reason", "cycleNumber"],
  [SLA_EVENT_TYPES.WARNING_REACHED]: ["target", "thresholdPercent", "escalationLevel", "enforcementMode"],
  [SLA_EVENT_TYPES.BREACHED]: ["target", "thresholdPercent", "escalationLevel", "enforcementMode"],
  [SLA_EVENT_TYPES.ESCALATED]: ["target", "thresholdPercent", "escalationLevel", "enforcementMode", "fromPriority", "toPriority", "ownerUserId"],
  [ROUTING_EVENT_TYPES.OVERRIDDEN]: ["fromQueueId", "toQueueId", "fromSupportTeamId", "toSupportTeamId", "routeVersion"],
};

function isSafeAttribute(value: unknown): value is SafeAttribute {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

export function safeTicketEventAttributes(
  eventType: TicketDomainEventType,
  metadata: Prisma.InputJsonValue | undefined
): Record<string, SafeAttribute> {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") return {};

  const source = metadata as Record<string, unknown>;
  return Object.fromEntries(
    safeAttributeKeys[eventType]
      .filter((key) => isSafeAttribute(source[key]))
      .map((key) => [key, source[key] as SafeAttribute])
  );
}

export async function appendTicketEvent(
  transaction: Prisma.TransactionClient,
  input: AppendTicketEventInput
) {
  const eventType = requireTicketDomainEventType(input.type);
  const eventId = randomUUID();
  const occurredAt = input.occurredAt ?? new Date();
  const ticket = await transaction.ticket.findUnique({
    where: { id: input.ticketInternalId },
    select: {
      ticketId: true,
      version: true,
      partyId: true,
      organizationId: true,
      priority: true,
      routeVersion: true,
      ownerUserId: true,
      legacyImported: true,
      rootCause: true,
      normalizedRootCause: {
        select: { id: true, code: true, name: true },
      },
      party: { select: { type: true } },
      requestType: {
        select: {
          id: true,
          code: true,
          name: true,
          service: { select: { id: true, code: true, name: true } },
        },
      },
      supportTeam: { select: { id: true, code: true, name: true } },
      queue: { select: { id: true, code: true, name: true } },
      sla: {
        select: {
          policyCode: true,
          policyVersion: true,
          clockType: true,
          enforcementMode: true,
          startedAt: true,
          firstResponseDueAt: true,
          resolutionDueAt: true,
          firstResponseState: true,
          resolutionState: true,
        },
      },
    },
  });
  if (!ticket || ticket.ticketId !== input.ticketPublicId) {
    throw new Error("Ticket event aggregate does not match a persisted ticket");
  }

  const aggregateVersion = input.aggregateVersion ?? ticket.version;
  const event = await transaction.ticketEvent.create({
    data: {
      eventId,
      ticketId: input.ticketInternalId,
      type: eventType,
      schemaVersion: EVENT_SCHEMA_VERSION,
      aggregateVersion,
      visibility: input.visibility ?? "INTERNAL",
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      actorType: input.actorType,
      sourceType: input.sourceType,
      actorUserId: input.actorUserId ?? null,
      correlationId: input.correlationId ?? null,
      causationId: input.causationId ?? null,
      reason: input.reason ?? null,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      createdAt: occurredAt,
    },
  });

  const snapshotComplete = Boolean(
    !ticket.legacyImported && ticket.requestType && ticket.supportTeam && ticket.queue && ticket.sla
  );
  await transaction.outboxEvent.create({
    data: {
      eventId,
      ticketEventId: event.id,
      aggregateType: "TICKET",
      aggregateId: input.ticketPublicId,
      eventType,
      schemaVersion: EVENT_SCHEMA_VERSION,
      payload: {
        eventId,
        eventType,
        aggregateType: "TICKET",
        aggregateId: input.ticketPublicId,
        aggregateVersion,
        schemaVersion: EVENT_SCHEMA_VERSION,
        occurredAt: occurredAt.toISOString(),
        actor: {
          type: input.actorType,
          id: input.actorUserId === undefined || input.actorUserId === null
            ? null
            : String(input.actorUserId),
        },
        sourceType: input.sourceType,
        scope: {
          partyId: ticket.partyId === null ? null : String(ticket.partyId),
          organizationId: ticket.organizationId === null ? null : String(ticket.organizationId),
        },
        correlationId: input.correlationId ?? null,
        causationId: input.causationId ?? null,
        payload: {
          fromStatus: input.fromStatus ?? null,
          toStatus: input.toStatus ?? null,
          dimensions: {
            snapshotStatus: snapshotComplete ? "COMPLETE" : "INCOMPLETE",
            partyType: ticket.party?.type === "PERSON" ? "INDIVIDUAL" : ticket.party?.type ?? null,
            legacyImported: ticket.legacyImported,
            channel: input.sourceType === "HUMAN" ? "WEB" : input.sourceType,
            priority: ticket.priority,
            routeVersion: ticket.routeVersion,
            ownerUserId: ticket.ownerUserId === null ? null : String(ticket.ownerUserId),
            rootCauseRecorded: Boolean(ticket.rootCause),
            partyKeyHash:
              ticket.partyId === null
                ? null
                : hashSecurityValue("reporting-party", String(ticket.partyId)),
            normalizedRootCause: ticket.normalizedRootCause
              ? {
                  id: String(ticket.normalizedRootCause.id),
                  code: ticket.normalizedRootCause.code,
                  name: ticket.normalizedRootCause.name,
                }
              : null,
            incidentKey: null,
            service: ticket.requestType
              ? { id: String(ticket.requestType.service.id), code: ticket.requestType.service.code, name: ticket.requestType.service.name }
              : null,
            requestType: ticket.requestType
              ? { id: String(ticket.requestType.id), code: ticket.requestType.code, name: ticket.requestType.name }
              : null,
            supportTeam: ticket.supportTeam
              ? { id: String(ticket.supportTeam.id), code: ticket.supportTeam.code, name: ticket.supportTeam.name }
              : null,
            queue: ticket.queue
              ? { id: String(ticket.queue.id), code: ticket.queue.code, name: ticket.queue.name }
              : null,
            slaPolicy: ticket.sla
              ? {
                  code: ticket.sla.policyCode,
                  version: ticket.sla.policyVersion,
                  clockType: ticket.sla.clockType,
                  enforcementMode: ticket.sla.enforcementMode,
                  startedAt: ticket.sla.startedAt.toISOString(),
                  firstResponseDueAt: ticket.sla.firstResponseDueAt.toISOString(),
                  resolutionDueAt: ticket.sla.resolutionDueAt.toISOString(),
                  firstResponseState: ticket.sla.firstResponseState,
                  resolutionState: ticket.sla.resolutionState,
                }
              : null,
          },
          attributes: safeTicketEventAttributes(eventType, input.metadata),
        },
      },
      occurredAt,
      availableAt: occurredAt,
    },
  });
  return event;
}
