import type { Prisma } from "@prisma/client";
import {
  parseReportingEventEnvelope,
  type ReportingOutboxEvent,
} from "@/modules/reporting/contracts/reporting-event-envelope";

function outboxEvent(
  overrides: Partial<ReportingOutboxEvent> = {}
): ReportingOutboxEvent {
  const occurredAt = new Date("2026-09-15T08:00:00.000Z");
  const eventId = "b53e97d7-d027-4e5b-8db0-c45147717293";
  const payload = {
    eventId,
    eventType: "ticket.created.v1",
    aggregateType: "TICKET",
    aggregateId: "TK-REPORT-1",
    aggregateVersion: 1,
    schemaVersion: 1,
    occurredAt: occurredAt.toISOString(),
    actor: { type: "USER", id: "7" },
    sourceType: "HUMAN",
    scope: { partyId: "11", organizationId: null },
    correlationId: null,
    causationId: null,
    payload: {
      fromStatus: null,
      toStatus: "UNASSIGNED",
      dimensions: { snapshotStatus: "COMPLETE" },
      attributes: {},
    },
  } as Prisma.JsonObject;
  return {
    id: BigInt(1),
    eventId,
    aggregateType: "TICKET",
    aggregateId: "TK-REPORT-1",
    eventType: "ticket.created.v1",
    schemaVersion: 1,
    payload,
    occurredAt,
    ...overrides,
  };
}

describe("reporting event envelope", () => {
  it("parses a matching v1 envelope", () => {
    const parsed = parseReportingEventEnvelope(outboxEvent());
    expect(parsed.aggregateVersion).toBe(1);
    expect(parsed.occurredAtDate.toISOString()).toBe("2026-09-15T08:00:00.000Z");
  });

  it("rejects an envelope that does not match its outbox identity", () => {
    expect(() =>
      parseReportingEventEnvelope(outboxEvent({ aggregateId: "TK-TAMPERED" }))
    ).toThrow("does not match");
  });

  it("rejects a schema version the projection does not understand", () => {
    expect(() =>
      parseReportingEventEnvelope(outboxEvent({ schemaVersion: 2 }))
    ).toThrow("Unsupported reporting event schema version");
  });
});
