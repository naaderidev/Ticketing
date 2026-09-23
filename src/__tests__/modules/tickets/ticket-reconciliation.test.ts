import { runSerializableTransaction } from "@/lib/database-transaction";
import { appendTicketEvent } from "@/modules/tickets/application/ticket-event-outbox";
import { reconcileMappedLegacyTickets } from "@/modules/tickets/application/ticket-service";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/attachment-service", () => ({
  claimPendingUploads: jest.fn(),
}));
jest.mock("@/lib/database-transaction", () => ({
  runSerializableTransaction: jest.fn(),
}));
jest.mock("@/modules/tickets/application/ticket-event-outbox", () => ({
  appendTicketEvent: jest.fn(),
}));

describe("legacy ticket mapping reconciliation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("moves only explicitly mapped quarantined tickets to one active route", async () => {
    const transaction = {
      legacySupportCatalogMapping: {
        findMany: jest.fn().mockResolvedValue([
          {
            legacyId: 7,
            supportRequestType: {
              id: 12,
              routes: [
                {
                  id: 31,
                  version: 3,
                  defaultPriority: "HIGH",
                  slaPolicyId: 41,
                  queue: { id: 5, teamId: 9 },
                },
              ],
            },
          },
        ]),
      },
      ticket: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 21,
            ticketId: "TK-LEGACY-21",
            version: 1,
            lifecycleStatus: "IN_PROGRESS",
            queueId: 2,
            supportTeamId: 4,
            subDepartmentId: 7,
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      ticketAssignment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 22 }),
      },
      routingDecision: {
        create: jest.fn().mockResolvedValue({ id: BigInt(23) }),
      },
    };
    (runSerializableTransaction as jest.Mock).mockImplementation((operation) =>
      operation(transaction)
    );

    await expect(reconcileMappedLegacyTickets(999)).resolves.toEqual({
      reconciled: 1,
      skipped: 0,
    });
    expect(
      transaction.legacySupportCatalogMapping.findMany
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          supportRequestType: expect.objectContaining({
            status: "ACTIVE",
            service: { status: "ACTIVE" },
          }),
        }),
      })
    );
    expect(transaction.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
        where: expect.objectContaining({
          subDepartmentId: { in: [7] },
          legacyImported: true,
        }),
      })
    );
    expect(transaction.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 21, version: 1 }),
        data: expect.objectContaining({
          requestTypeId: 12,
          supportTeamId: 9,
          queueId: 5,
          routeVersion: 3,
          priority: "HIGH",
          version: { increment: 1 },
        }),
      })
    );
    expect(transaction.ticketAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: 21,
        supportTeamId: 9,
        queueId: 5,
        activeKey: "21",
      }),
    });
    expect(transaction.routingDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: 21,
        routeId: 31,
        slaPolicyId: 41,
        source: "RECONCILIATION",
      }),
    });
    expect(appendTicketEvent).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        ticketInternalId: 21,
        ticketPublicId: "TK-LEGACY-21",
        type: "ticket.transferred.v1",
      })
    );
  });

  it("does not reconcile ambiguous or inactive mappings", async () => {
    const transaction = {
      legacySupportCatalogMapping: {
        findMany: jest.fn().mockResolvedValue([
          {
            legacyId: 7,
            supportRequestType: { id: 12, routes: [{}, {}] },
          },
        ]),
      },
      ticket: { findMany: jest.fn() },
    };
    (runSerializableTransaction as jest.Mock).mockImplementation((operation) =>
      operation(transaction)
    );

    await expect(reconcileMappedLegacyTickets()).resolves.toEqual({
      reconciled: 0,
      skipped: 0,
    });
    expect(transaction.ticket.findMany).not.toHaveBeenCalled();
    expect(appendTicketEvent).not.toHaveBeenCalled();
  });
});
