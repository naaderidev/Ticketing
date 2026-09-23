import { isOutboxDispatchEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import {
  processSlaOutbox,
  sweepSlaThresholds,
} from "@/modules/sla-routing/application/sla-worker";
import {
  markTicketFirstResponse,
  pauseTicketResolutionSla,
} from "@/modules/sla-routing/application/sla-service";
import { runSerializableTransaction } from "@/lib/database-transaction";
import { appendTicketEvent } from "@/modules/tickets/application/ticket-event-outbox";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    outboxEvent: { findMany: jest.fn(), update: jest.fn() },
    outboxDelivery: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    ticketSla: { findMany: jest.fn() },
  },
}));
jest.mock("@/lib/feature-flags", () => ({
  isOutboxDispatchEnabled: jest.fn(),
}));
jest.mock("@/lib/sla-routing-config", () => ({
  getSlaRoutingConfig: jest.fn(() => ({
    maintenanceToken: "test",
    batchSize: 100,
    lockSeconds: 120,
    outboxMaxAttempts: 5,
  })),
}));
jest.mock("@/lib/database-transaction", () => ({
  runSerializableTransaction: jest.fn(),
}));
jest.mock("@/modules/tickets/application/ticket-event-outbox", () => ({
  appendTicketEvent: jest.fn(),
}));
jest.mock("@/modules/sla-routing/application/sla-service", () => ({
  backfillMissingTicketSlas: jest.fn(),
  markTicketFirstResponse: jest.fn(),
  markTicketResolved: jest.fn(),
  pauseTicketResolutionSla: jest.fn(),
  resumeTicketResolutionSla: jest.fn(),
}));

describe("SLA outbox worker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.outboxDelivery.count as jest.Mock).mockResolvedValue(0);
  });

  it("seeds an idempotent delivery ledger while dispatch is disabled", async () => {
    (prisma.outboxEvent.findMany as jest.Mock).mockResolvedValue([
      { id: BigInt(1), availableAt: new Date("2026-09-13T00:00:00.000Z") },
    ]);
    (prisma.outboxDelivery.createMany as jest.Mock).mockResolvedValue({ count: 1 });
    (isOutboxDispatchEnabled as jest.Mock).mockReturnValue(false);

    await expect(processSlaOutbox()).resolves.toEqual({
      enabled: false,
      seeded: 1,
      processed: 0,
      retried: 0,
      deadLettered: 0,
    });
    expect(prisma.outboxDelivery.findMany).not.toHaveBeenCalled();
    expect(prisma.outboxDelivery.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
  });

  it("does not process a delivery when another worker wins its lock", async () => {
    (prisma.outboxEvent.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.outboxDelivery.findMany as jest.Mock).mockResolvedValue([
      {
        id: BigInt(1),
        attemptCount: 0,
        outboxEvent: { id: BigInt(2), aggregateId: "TK-R5-12" },
      },
    ]);
    (prisma.outboxDelivery.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (isOutboxDispatchEnabled as jest.Mock).mockReturnValue(true);

    await expect(processSlaOutbox()).resolves.toEqual({
      enabled: true,
      seeded: 0,
      processed: 0,
      retried: 0,
      deadLettered: 0,
    });
    expect(prisma.outboxDelivery.findFirst).not.toHaveBeenCalled();
  });

  it("does not overtake an earlier undelivered event for the same ticket", async () => {
    (prisma.outboxEvent.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.outboxDelivery.findMany as jest.Mock).mockResolvedValue([
      {
        id: BigInt(4),
        attemptCount: 0,
        outboxEvent: { id: BigInt(20), aggregateId: "TK-R5-12" },
      },
    ]);
    (prisma.outboxDelivery.count as jest.Mock).mockResolvedValue(1);
    (isOutboxDispatchEnabled as jest.Mock).mockReturnValue(true);

    await expect(processSlaOutbox()).resolves.toMatchObject({ processed: 0 });
    expect(prisma.outboxDelivery.updateMany).not.toHaveBeenCalled();
  });

  it("projects a customer-input request into one SLA pause", async () => {
    const occurredAt = new Date("2026-09-13T08:00:00.000Z");
    const transaction = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue({
          id: 12,
          ticketId: "TK-R5-12",
        }),
      },
      outboxDelivery: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      outboxEvent: {
        update: jest.fn().mockResolvedValue({ id: BigInt(2) }),
      },
    };
    (runSerializableTransaction as jest.Mock).mockImplementation((operation) =>
      operation(transaction)
    );
    (prisma.outboxEvent.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.outboxDelivery.findMany as jest.Mock).mockResolvedValue([
      {
        id: BigInt(1),
        attemptCount: 0,
        outboxEvent: { id: BigInt(2), aggregateId: "TK-R5-12" },
      },
    ]);
    (prisma.outboxDelivery.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    (prisma.outboxDelivery.findFirst as jest.Mock).mockResolvedValue({
      id: BigInt(1),
      outboxEvent: {
        id: BigInt(2),
        aggregateId: "TK-R5-12",
        eventType: "ticket.customer_input_requested.v1",
        occurredAt,
      },
    });
    (isOutboxDispatchEnabled as jest.Mock).mockReturnValue(true);

    await expect(processSlaOutbox()).resolves.toMatchObject({ processed: 1 });
    expect(pauseTicketResolutionSla).toHaveBeenCalledWith(transaction, {
      ticketId: 12,
      ticketPublicId: "TK-R5-12",
      occurredAt,
      actorType: "SYSTEM",
      sourceType: "AUTOMATION",
    });
  });

  it.each(["ticket.public_message_added.v1", "ticket.staff_replied.v1"])(
    "projects one human staff reply from %s into the first-response marker",
    async (eventType) => {
      const occurredAt = new Date("2026-09-13T08:00:00.000Z");
      const transaction = {
        ticket: {
          findUnique: jest.fn().mockResolvedValue({
            id: 12,
            ticketId: "TK-R5-12",
          }),
        },
        outboxDelivery: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        outboxEvent: {
          update: jest.fn().mockResolvedValue({ id: BigInt(2) }),
        },
      };
      (runSerializableTransaction as jest.Mock).mockImplementation((operation) =>
        operation(transaction)
      );
      (prisma.outboxEvent.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.outboxDelivery.findMany as jest.Mock).mockResolvedValue([
        {
          id: BigInt(1),
          attemptCount: 0,
          outboxEvent: { id: BigInt(2), aggregateId: "TK-R5-12" },
        },
      ]);
      (prisma.outboxDelivery.updateMany as jest.Mock)
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      (prisma.outboxDelivery.findFirst as jest.Mock).mockResolvedValue({
        id: BigInt(1),
        outboxEvent: {
          id: BigInt(2),
          aggregateId: "TK-R5-12",
          eventType,
          occurredAt,
          ticketEvent: { actorType: "STAFF", sourceType: "HUMAN" },
        },
      });
      (isOutboxDispatchEnabled as jest.Mock).mockReturnValue(true);

      await expect(processSlaOutbox()).resolves.toMatchObject({ processed: 1 });
      expect(markTicketFirstResponse).toHaveBeenCalledTimes(1);
      expect(markTicketFirstResponse).toHaveBeenCalledWith(
        transaction,
        12,
        occurredAt
      );
    }
  );

  it("does not count a customer public message as a staff first response", async () => {
    const occurredAt = new Date("2026-09-13T08:00:00.000Z");
    const transaction = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue({ id: 12, ticketId: "TK-R5-12" }),
      },
      outboxDelivery: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      outboxEvent: { update: jest.fn().mockResolvedValue({ id: BigInt(2) }) },
    };
    (runSerializableTransaction as jest.Mock).mockImplementation((operation) =>
      operation(transaction)
    );
    (prisma.outboxEvent.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.outboxDelivery.findMany as jest.Mock).mockResolvedValue([
      {
        id: BigInt(1),
        attemptCount: 0,
        outboxEvent: { id: BigInt(2), aggregateId: "TK-R5-12" },
      },
    ]);
    (prisma.outboxDelivery.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    (prisma.outboxDelivery.findFirst as jest.Mock).mockResolvedValue({
      id: BigInt(1),
      outboxEvent: {
        id: BigInt(2),
        aggregateId: "TK-R5-12",
        eventType: "ticket.public_message_added.v1",
        occurredAt,
        ticketEvent: { actorType: "USER", sourceType: "HUMAN" },
      },
    });
    (isOutboxDispatchEnabled as jest.Mock).mockReturnValue(true);

    await expect(processSlaOutbox()).resolves.toMatchObject({ processed: 1 });
    expect(markTicketFirstResponse).not.toHaveBeenCalled();
  });

  it("does not emit a threshold event when a concurrent worker already advanced it", async () => {
    const now = new Date("2026-09-13T12:00:00.000Z");
    (prisma.ticketSla.findMany as jest.Mock).mockResolvedValue([
      { id: BigInt(9) },
    ]);
    const transaction = {
      ticketSla: {
        findUnique: jest.fn().mockResolvedValue({
          id: BigInt(9),
          legacyImported: false,
          firstRespondedAt: null,
          firstResponseState: "PENDING",
          firstResponseWarningLevel: "NONE",
          firstResponseWarning70At: new Date("2026-09-13T09:00:00.000Z"),
          firstResponseWarning90At: new Date("2026-09-13T10:00:00.000Z"),
          firstResponseDueAt: new Date("2026-09-13T11:00:00.000Z"),
          resolvedAt: now,
          pausedAt: null,
          enforcementMode: "OBSERVE_ONLY",
          ticket: {
            id: 12,
            ticketId: "TK-R5-12",
            ownerUserId: null,
            supportTeamId: 3,
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    (runSerializableTransaction as jest.Mock).mockImplementation((operation) =>
      operation(transaction)
    );

    await expect(sweepSlaThresholds(10, now)).resolves.toEqual({
      evaluated: 1,
      eventsCreated: 0,
    });
    expect(appendTicketEvent).not.toHaveBeenCalled();
  });

  it("promotes priority and assigns the team supervisor after sustained breach", async () => {
    const now = new Date("2026-09-13T12:00:00.000Z");
    (prisma.ticketSla.findMany as jest.Mock).mockResolvedValue([{ id: BigInt(9) }]);
    const transaction = {
      ticketSla: {
        findUnique: jest.fn().mockResolvedValue({
          id: BigInt(9),
          legacyImported: false,
          firstRespondedAt: new Date("2026-09-13T08:00:00.000Z"),
          firstResponseState: "MET",
          firstResponseWarningLevel: "NONE",
          resolvedAt: null,
          pausedAt: null,
          resolutionState: "BREACHED",
          resolutionWarningLevel: "NINETY",
          resolutionEscalationLevel: "SUPERVISOR",
          resolutionManagerAt: new Date("2026-09-13T11:00:00.000Z"),
          enforcementMode: "ENFORCED",
          ticket: {
            id: 12,
            ticketId: "TK-R5-12",
            ownerUserId: 41,
            supportTeamId: 3,
            queueId: 8,
            priority: "NORMAL",
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      userRoleAssignment: {
        findFirst: jest.fn().mockResolvedValue({ userId: 52 }),
        findMany: jest.fn().mockResolvedValue([{ userId: 60 }]),
      },
      ticket: { update: jest.fn().mockResolvedValue({ id: 12 }) },
      ticketAssignment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: BigInt(8) }),
      },
      notification: { create: jest.fn().mockResolvedValue({ id: 3 }) },
    };
    (runSerializableTransaction as jest.Mock).mockImplementation((operation) =>
      operation(transaction)
    );

    await expect(sweepSlaThresholds(10, now)).resolves.toEqual({
      evaluated: 1,
      eventsCreated: 1,
    });
    expect(transaction.ticket.update).toHaveBeenCalledWith({
      where: { id: 12 },
      data: { priority: "HIGH", ownerUserId: 52, version: { increment: 1 } },
    });
    expect(transaction.ticketAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: 12,
        ownerUserId: 52,
        activeKey: "12",
      }),
    });
    expect(appendTicketEvent).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ type: "ticket.priority_changed.v1" })
    );
    expect(appendTicketEvent).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ type: "ticket.assigned.v1" })
    );
  });
});
