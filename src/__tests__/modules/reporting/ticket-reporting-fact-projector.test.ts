import type { Prisma } from "@prisma/client";
import { parseReportingEventEnvelope } from "@/modules/reporting/contracts/reporting-event-envelope";
import {
  matureFcrStatus,
  projectTicketReportingFact,
  type TicketFactState,
} from "@/modules/reporting/application/ticket-reporting-fact-projector";
import type { TicketDomainEventType } from "@/modules/tickets/contracts/ticket-domain-events";

const baseTime = new Date("2026-09-15T08:00:00.000Z");

function event(
  eventType: TicketDomainEventType,
  options: {
    version?: number | null;
    minutes?: number;
    actorType?: "USER" | "STAFF" | "SYSTEM";
    sourceType?: "HUMAN" | "AUTOMATION" | "MIGRATION";
    snapshotStatus?: "COMPLETE" | "INCOMPLETE" | "HISTORICAL_INCOMPLETE";
    attributes?: Record<string, string | number | boolean | null>;
    firstResponseState?: "PENDING" | "MET" | "BREACHED";
    resolutionState?: "PENDING" | "MET" | "BREACHED";
    omitSlaStartedAt?: boolean;
  } = {}
) {
  const occurredAt = new Date(
    baseTime.getTime() + (options.minutes ?? 0) * 60_000
  );
  const eventId = `b53e97d7-d027-4e5b-8db0-${String(
    (options.minutes ?? 0) + eventType.length
  ).padStart(12, "0")}`;
  const payload = {
    eventId,
    eventType,
    aggregateType: "TICKET",
    aggregateId: "TK-REPORT-1",
    aggregateVersion: options.version === undefined ? 1 : options.version,
    schemaVersion: 1,
    occurredAt: occurredAt.toISOString(),
    actor: { type: options.actorType ?? "USER", id: "7" },
    sourceType: options.sourceType ?? "HUMAN",
    scope: { partyId: "11", organizationId: "4" },
    correlationId: null,
    causationId: null,
    payload: {
      fromStatus: null,
      toStatus: null,
      dimensions: {
        snapshotStatus: options.snapshotStatus ?? "COMPLETE",
        partyType: "ORGANIZATION",
        legacyImported: false,
        channel: "WEB",
        priority: "HIGH",
        routeVersion: 1,
        ownerUserId: "9",
        rootCauseRecorded: true,
        partyKeyHash: "a".repeat(64),
        normalizedRootCause: {
          id: "40",
          code: "APP_AUTH_SESSION",
          name: "اختلال نشست و احراز هویت",
        },
        incidentKey: null,
        service: { id: "20", code: "ACCOUNT", name: "حساب" },
        requestType: { id: "21", code: "SECURITY", name: "امنیت" },
        supportTeam: { id: "30", code: "SECURITY", name: "تیم امنیت" },
        queue: { id: "31", code: "SECURITY_DEFAULT", name: "صف امنیت" },
        slaPolicy: {
          code: "SLA-HIGH",
          version: 1,
          clockType: "BUSINESS",
          enforcementMode: "ENFORCED",
          ...(options.omitSlaStartedAt
            ? {}
            : { startedAt: baseTime.toISOString() }),
          firstResponseDueAt: new Date(baseTime.getTime() + 60 * 60_000).toISOString(),
          resolutionDueAt: new Date(baseTime.getTime() + 240 * 60_000).toISOString(),
          firstResponseState: options.firstResponseState ?? "PENDING",
          resolutionState: options.resolutionState ?? "PENDING",
        },
      },
      attributes: options.attributes ?? {},
    },
  } as Prisma.JsonObject;
  return parseReportingEventEnvelope({
    id: BigInt((options.minutes ?? 0) + 1),
    eventId,
    aggregateType: "TICKET",
    aggregateId: "TK-REPORT-1",
    eventType,
    schemaVersion: 1,
    payload,
    occurredAt,
  });
}

function appliedValues(
  current: TicketFactState | null,
  eventType: TicketDomainEventType,
  projectionEvent: ReturnType<typeof event>
): TicketFactState {
  const decision = projectTicketReportingFact(current, eventType, projectionEvent);
  expect(decision.outcome).toBe("APPLIED");
  if (decision.outcome !== "APPLIED") throw new Error("Expected applied projection");
  return decision.values;
}

describe("ticket reporting fact projector", () => {
  it("creates a healthy fact exclusively from the creation snapshot", () => {
    const created = event("ticket.created.v1");
    const fact = appliedValues(null, "ticket.created.v1", created);
    expect(fact).toMatchObject({
      sourceAggregateVersion: 1,
      serviceCode: "ACCOUNT",
      requestTypeCode: "SECURITY",
      organizationId: 4,
      partyType: "ORGANIZATION",
      priorityAtCreation: "HIGH",
      partyKeyHash: "a".repeat(64),
      normalizedRootCauseId: 40,
      normalizedRootCauseCode: "APP_AUTH_SESSION",
      dataQualityStatus: "HEALTHY",
      exclusionReason: null,
    });
  });

  it("marks historical data as excluded and never fills it from a newer snapshot", () => {
    const historical = event("ticket.created.v1", {
      version: null,
      snapshotStatus: "HISTORICAL_INCOMPLETE",
    });
    const fact = appliedValues(null, "ticket.created.v1", historical);
    expect(fact).toMatchObject({
      dataQualityStatus: "EXCLUDED",
      exclusionReason: "HISTORICAL_INCOMPLETE",
    });

    const newer = event("ticket.routed.v1", { version: 1, minutes: 1 });
    expect(projectTicketReportingFact(fact, "ticket.routed.v1", newer)).toEqual({
      outcome: "IGNORED",
      reasonCode: "FACT_EXCLUDED_HISTORICAL",
      values: null,
    });
  });

  it("projects response, pause, resolution, close and FCR deterministically", () => {
    let fact = appliedValues(null, "ticket.created.v1", event("ticket.created.v1"));
    fact = appliedValues(
      fact,
      "sla.started.v1",
      event("sla.started.v1", { minutes: 0 })
    );
    fact = appliedValues(
      fact,
      "ticket.public_message_added.v1",
      event("ticket.public_message_added.v1", {
        version: 2,
        minutes: 40,
        actorType: "STAFF",
        firstResponseState: "MET",
      })
    );
    fact = appliedValues(
      fact,
      "sla.resumed.v1",
      event("sla.resumed.v1", {
        version: 3,
        minutes: 90,
        actorType: "SYSTEM",
        sourceType: "AUTOMATION",
        attributes: { effectivePauseMilliseconds: 600_000 },
      })
    );
    fact = appliedValues(
      fact,
      "ticket.resolved.v1",
      event("ticket.resolved.v1", {
        version: 4,
        minutes: 180,
        actorType: "STAFF",
        resolutionState: "MET",
      })
    );
    fact = appliedValues(
      fact,
      "ticket.closed.v1",
      event("ticket.closed.v1", { version: 5, minutes: 181 })
    );

    expect(fact.firstResponseEffectiveMilliseconds).toBe(BigInt(2_400_000));
    expect(fact.resolutionEffectiveMilliseconds).toBe(BigInt(10_200_000));
    expect(fact.fcrStatus).toBe("PENDING_WINDOW");
    expect(fact.firstClosedAt?.toISOString()).toBe("2026-09-15T11:01:00.000Z");
    expect(matureFcrStatus(fact)).toBe("ACHIEVED");
  });

  it("detects an aggregate version gap before changing the fact", () => {
    const fact = appliedValues(null, "ticket.created.v1", event("ticket.created.v1"));
    expect(() =>
      projectTicketReportingFact(
        fact,
        "ticket.assigned.v1",
        event("ticket.assigned.v1", { version: 3, minutes: 1 })
      )
    ).toThrow("expected version 2");
  });

  it("uses the terminal SLA state captured by the event snapshot", () => {
    const fact = appliedValues(null, "ticket.created.v1", event("ticket.created.v1"));
    const lateResponse = appliedValues(
      fact,
      "ticket.public_message_added.v1",
      event("ticket.public_message_added.v1", {
        version: 2,
        minutes: 70,
        actorType: "STAFF",
        firstResponseState: "BREACHED",
      })
    );
    expect(lateResponse.firstResponseSlaState).toBe("BREACHED");
    expect(lateResponse.firstResponseDueAt?.toISOString()).toBe(
      "2026-09-15T09:00:00.000Z"
    );
  });

  it("never substitutes ticket creation time for a missing SLA start", () => {
    const fact = appliedValues(
      null,
      "ticket.created.v1",
      event("ticket.created.v1", { omitSlaStartedAt: true })
    );
    const response = appliedValues(
      fact,
      "ticket.public_message_added.v1",
      event("ticket.public_message_added.v1", {
        version: 2,
        minutes: 30,
        actorType: "STAFF",
        firstResponseState: "MET",
        omitSlaStartedAt: true,
      })
    );
    expect(response.firstResponseEffectiveMilliseconds).toBeNull();
    expect(response).toMatchObject({
      dataQualityStatus: "INCOMPLETE",
      exclusionReason: "MISSING_SLA_START_EVENT",
    });
  });

  it("advances the aggregate cursor for a known event with no fact metric", () => {
    const fact = appliedValues(null, "ticket.created.v1", event("ticket.created.v1"));
    const ignored = projectTicketReportingFact(
      fact,
      "ticket.internal_note_added.v1",
      event("ticket.internal_note_added.v1", { version: 2, minutes: 1 })
    );
    expect(ignored).toMatchObject({
      outcome: "IGNORED",
      reasonCode: "NO_TICKET_FACT_EFFECT",
      values: { sourceAggregateVersion: 2 },
    });
  });

  it("counts a resolution rejection once when the following reopen event arrives", () => {
    let fact = appliedValues(null, "ticket.created.v1", event("ticket.created.v1"));
    fact = appliedValues(
      fact,
      "ticket.resolution_rejected.v1",
      event("ticket.resolution_rejected.v1", { version: 2, minutes: 1 })
    );
    fact = appliedValues(
      fact,
      "ticket.reopened.v1",
      event("ticket.reopened.v1", { version: 2, minutes: 1 })
    );
    expect(fact.reopenCount).toBe(1);
    expect(fact.resolutionRejectionCount).toBe(1);
    expect(fact.reopenWithinWindowEventCount).toBe(0);
    expect(fact.fcrStatus).toBe("NOT_ACHIEVED");
  });

  it("attributes a reopen only when it occurs inside the first closure window", () => {
    let fact = appliedValues(null, "ticket.created.v1", event("ticket.created.v1"));
    fact = appliedValues(
      fact,
      "ticket.resolved.v1",
      event("ticket.resolved.v1", {
        version: 2,
        minutes: 60,
        actorType: "STAFF",
        resolutionState: "MET",
      })
    );
    fact = appliedValues(
      fact,
      "ticket.closed.v1",
      event("ticket.closed.v1", { version: 3, minutes: 61 })
    );
    fact = appliedValues(
      fact,
      "ticket.reopened.v1",
      event("ticket.reopened.v1", {
        version: 4,
        minutes: 62,
        actorType: "USER",
      })
    );

    expect(fact).toMatchObject({
      reopenedWithinWindow: true,
      reopenCount: 1,
      reopenWithinWindowEventCount: 1,
      customerReopenWithinWindowCount: 1,
      staffReopenWithinWindowCount: 0,
      systemReopenWithinWindowCount: 0,
      fcrStatus: "NOT_ACHIEVED",
    });

    const afterWindow = event("ticket.reopened.v1", {
      version: 5,
      minutes: 61 + 8 * 24 * 60,
      actorType: "STAFF",
    });
    fact = appliedValues(fact, "ticket.reopened.v1", afterWindow);
    expect(fact.reopenCount).toBe(2);
    expect(fact.reopenWithinWindowEventCount).toBe(1);
    expect(fact.staffReopenWithinWindowCount).toBe(0);
  });
});
