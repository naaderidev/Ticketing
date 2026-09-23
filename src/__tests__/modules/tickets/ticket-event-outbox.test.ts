import type { Prisma } from "@prisma/client";
import {
  appendTicketEvent,
  safeTicketEventAttributes,
} from "@/modules/tickets/application/ticket-event-outbox";

function ticketSnapshot() {
  return {
    ticketId: "TK-ABC-12345678",
    version: 4,
    partyId: 11,
    organizationId: null,
    priority: "NORMAL",
    routeVersion: 2,
    ownerUserId: 9,
    legacyImported: false,
    rootCause: "متن داخلی علت ریشه‌ای",
    normalizedRootCause: {
      id: 8,
      code: "APP_AUTH_SESSION",
      name: "اختلال نشست و احراز هویت",
    },
    party: { type: "PERSON" },
    requestType: {
      id: 21,
      code: "ACCOUNT_SECURITY",
      name: "امنیت حساب",
      service: { id: 20, code: "ACCOUNT", name: "حساب کاربری" },
    },
    supportTeam: { id: 30, code: "SECURITY", name: "تیم امنیت" },
    queue: { id: 31, code: "SECURITY_DEFAULT", name: "صف امنیت" },
    sla: {
      policyCode: "SLA-NORMAL",
      policyVersion: 1,
      clockType: "BUSINESS",
      enforcementMode: "ENFORCED",
      startedAt: new Date("2026-09-13T10:00:00.000Z"),
      firstResponseDueAt: new Date("2026-09-13T11:00:00.000Z"),
      resolutionDueAt: new Date("2026-09-13T14:00:00.000Z"),
      firstResponseState: "PENDING",
      resolutionState: "PENDING",
    },
  };
}

describe("ticket event outbox", () => {
  it("persists the domain event and delivery envelope through one transaction client", async () => {
    const transaction = {
      ticket: { findUnique: jest.fn().mockResolvedValue(ticketSnapshot()) },
      ticketEvent: {
        create: jest.fn().mockResolvedValue({ id: BigInt(41) }),
      },
      outboxEvent: { create: jest.fn().mockResolvedValue({ id: BigInt(42) }) },
    } as unknown as Prisma.TransactionClient;
    const occurredAt = new Date("2026-09-13T10:00:00.000Z");

    await appendTicketEvent(transaction, {
      ticketInternalId: 7,
      ticketPublicId: "TK-ABC-12345678",
      type: "ticket.created.v1",
      actorType: "USER",
      sourceType: "HUMAN",
      visibility: "PUBLIC",
      toStatus: "UNASSIGNED",
      actorUserId: 3,
      metadata: { routeVersion: 1 },
      occurredAt,
    });

    expect(transaction.ticketEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: 7,
        eventId: expect.any(String),
        type: "ticket.created.v1",
        aggregateVersion: 4,
        actorType: "USER",
        sourceType: "HUMAN",
        createdAt: occurredAt,
      }),
    });
    expect(transaction.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketEventId: BigInt(41),
        aggregateType: "TICKET",
        aggregateId: "TK-ABC-12345678",
        eventType: "ticket.created.v1",
        occurredAt,
        payload: expect.objectContaining({
          eventType: "ticket.created.v1",
          aggregateVersion: 4,
          actor: { type: "USER", id: "3" },
          sourceType: "HUMAN",
          scope: { partyId: "11", organizationId: null },
          payload: expect.objectContaining({
            dimensions: expect.objectContaining({
              snapshotStatus: "COMPLETE",
              partyType: "INDIVIDUAL",
              rootCauseRecorded: true,
              partyKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
              normalizedRootCause: {
                id: "8",
                code: "APP_AUTH_SESSION",
                name: "اختلال نشست و احراز هویت",
              },
              incidentKey: null,
              requestType: expect.objectContaining({ code: "ACCOUNT_SECURITY" }),
              slaPolicy: expect.objectContaining({
                startedAt: "2026-09-13T10:00:00.000Z",
                firstResponseDueAt: "2026-09-13T11:00:00.000Z",
                resolutionDueAt: "2026-09-13T14:00:00.000Z",
                firstResponseState: "PENDING",
                resolutionState: "PENDING",
              }),
            }),
            attributes: { routeVersion: 1 },
          }),
        }),
      }),
    });

    const domainEventId = (transaction.ticketEvent.create as jest.Mock).mock.calls[0][0].data.eventId;
    const outboxEventId = (transaction.outboxEvent.create as jest.Mock).mock.calls[0][0].data.eventId;
    expect(outboxEventId).toBe(domainEventId);
  });

  it("removes free text and unapproved fields from the delivery payload", () => {
    expect(
      safeTicketEventAttributes("ticket.resolved.v1", {
        resolutionSummary: "اطلاعات محرمانه مشتری",
        token: "secret",
      })
    ).toEqual({});

    expect(
      safeTicketEventAttributes("ticket.priority_changed.v1", {
        fromPriority: "NORMAL",
        toPriority: "HIGH",
        reason: "متن آزاد",
      })
    ).toEqual({ fromPriority: "NORMAL", toPriority: "HIGH" });

    expect(
      safeTicketEventAttributes("ticket.merged.v1", {
        sourceTicketId: "TK-DEMO-0001",
        targetTicketId: "TK-DEMO-0002",
        reason: "متن داخلی ادغام",
      })
    ).toEqual({
      sourceTicketId: "TK-DEMO-0001",
      targetTicketId: "TK-DEMO-0002",
    });
  });

  it("rejects an event outside the canonical catalog before persistence", async () => {
    const transaction = {
      ticket: { findUnique: jest.fn() },
      ticketEvent: { create: jest.fn() },
      outboxEvent: { create: jest.fn() },
    } as unknown as Prisma.TransactionClient;

    await expect(
      appendTicketEvent(transaction, {
        ticketInternalId: 7,
        ticketPublicId: "TK-ABC-12345678",
        type: "ticket.unknown.v1" as never,
        actorType: "SYSTEM",
        sourceType: "AUTOMATION",
      })
    ).rejects.toThrow("Unknown ticket domain event type");
    expect(transaction.ticket.findUnique).not.toHaveBeenCalled();
  });
});
