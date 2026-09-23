import {
  markTicketResolved,
  restartTicketResolutionSla,
} from "@/modules/sla-routing/application/sla-service";
import { appendTicketEvent } from "@/modules/tickets/application/ticket-event-outbox";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/modules/tickets/application/ticket-event-outbox", () => ({
  appendTicketEvent: jest.fn(),
}));

describe("SLA service", () => {
  it("atomically closes an active pause when a ticket is resolved", async () => {
    const pausedAt = new Date("2026-09-13T08:00:00.000Z");
    const resolvedAt = new Date("2026-09-13T08:15:00.000Z");
    const transaction = {
      ticketSla: {
        findUnique: jest.fn().mockResolvedValue({
          id: BigInt(7),
          firstResponseState: "MET",
          resolutionState: "PAUSED",
          firstRespondedAt: new Date("2026-09-13T07:30:00.000Z"),
          resolvedAt: null,
          pausedAt,
          resolutionDueAt: new Date("2026-09-13T10:00:00.000Z"),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      ticketSlaPause: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await expect(
      markTicketResolved(transaction as never, 12, resolvedAt)
    ).resolves.toBe(true);

    expect(transaction.ticketSla.updateMany).toHaveBeenCalledWith({
      where: { id: BigInt(7), resolvedAt: null },
      data: {
        resolvedAt,
        resolutionState: "MET",
        pausedAt: null,
      },
    });
    expect(transaction.ticketSlaPause.updateMany).toHaveBeenCalledWith({
      where: { ticketSlaId: BigInt(7), endedAt: null },
      data: {
        endedAt: resolvedAt,
        durationMilliseconds: BigInt(15 * 60 * 1000),
        activeKey: null,
      },
    });
  });

  it("does not close pause history if the resolution update loses a race", async () => {
    const transaction = {
      ticketSla: {
        findUnique: jest.fn().mockResolvedValue({
          id: BigInt(7),
          resolutionState: "PAUSED",
          resolvedAt: null,
          pausedAt: new Date("2026-09-13T08:00:00.000Z"),
          resolutionDueAt: new Date("2026-09-13T10:00:00.000Z"),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      ticketSlaPause: { updateMany: jest.fn() },
    };

    await expect(
      markTicketResolved(
        transaction as never,
        12,
        new Date("2026-09-13T08:15:00.000Z")
      )
    ).resolves.toBe(false);
    expect(transaction.ticketSlaPause.updateMany).not.toHaveBeenCalled();
  });

  it("starts a fresh resolution clock after reopening and preserves first response", async () => {
    const occurredAt = new Date("2026-09-13T08:00:00.000Z");
    const transaction = {
      ticketSla: {
        findUnique: jest.fn().mockResolvedValue({
          id: BigInt(7),
          ticketId: 12,
          policyId: 3,
          calendarId: null,
          policyCode: "BASE_CRITICAL",
          policyVersion: 1,
          calendarCode: null,
          calendarVersion: null,
          clockType: "CALENDAR",
          firstResponseMinutes: 15,
          resolutionMinutes: 240,
          enforcementMode: "ENFORCED",
          firstResponseState: "MET",
          resolutionState: "MET",
          firstResponseWarningLevel: "NONE",
          resolutionWarningLevel: "NINETY",
          resolutionEscalationLevel: "SUPERVISOR",
          resolutionCycleNumber: 1,
          resolvedAt: new Date("2026-09-13T07:00:00.000Z"),
          pausedAt: null,
          legacyImported: false,
          policy: {
            code: "BASE_CRITICAL",
            clockType: "CALENDAR",
            warning70Percent: 70,
            warning90Percent: 90,
            breachPercent: 100,
            managerPercent: 125,
            calendar: null,
          },
          pauses: [],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      ticketSlaPause: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };

    await expect(
      restartTicketResolutionSla(transaction as never, {
        ticketId: 12,
        ticketPublicId: "TK-R5-12",
        occurredAt,
        actorUserId: 4,
        reason: "TICKET_REOPENED",
      })
    ).resolves.toBe(true);

    expect(transaction.ticketSla.updateMany).toHaveBeenCalledWith({
      where: { id: BigInt(7), resolutionCycleNumber: 1 },
      data: expect.objectContaining({
        resolutionCycleNumber: 2,
        resolutionCycleStartedAt: occurredAt,
        resolutionState: "PENDING",
        resolutionWarningLevel: "NONE",
        resolutionEscalationLevel: "NONE",
        resolvedAt: null,
        pausedAt: null,
      }),
    });
    expect(appendTicketEvent).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        type: "sla.resolution_restarted.v1",
        metadata: { reason: "TICKET_REOPENED", cycleNumber: 2 },
      })
    );
  });
});
