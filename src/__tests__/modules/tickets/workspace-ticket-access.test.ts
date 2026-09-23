import { prisma } from "@/lib/prisma";
import { listWorkspaceTickets } from "@/modules/tickets/application/workspace-ticket-service";
import { SUPPORT_PERMISSIONS } from "@/modules/support-catalog/application/support-authorization";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    userRoleAssignment: { findMany: jest.fn() },
    ticket: { findMany: jest.fn() },
  },
}));
jest.mock("@/lib/attachment-service", () => ({
  claimPendingUploads: jest.fn(),
}));
jest.mock("@/lib/database-transaction", () => ({
  runSerializableTransaction: jest.fn(),
}));
jest.mock("@/modules/sla-routing/application/sla-service", () => ({
  markTicketFirstResponse: jest.fn(),
  markTicketResolved: jest.fn(),
  pauseTicketResolutionSla: jest.fn(),
  recordRoutingDecision: jest.fn(),
  toPublicSlaDto: jest.fn(),
}));
jest.mock("@/modules/tickets/application/ticket-event-outbox", () => ({
  appendTicketEvent: jest.fn(),
}));

function assignment(
  supportTeamId: number,
  permissionKeys: string[],
) {
  return {
    supportTeamId,
    scopeType: "SUPPORT_TEAM",
    scopeKey: String(supportTeamId),
    role: {
      permissions: permissionKeys.map((key) => ({ permission: { key } })),
    },
  };
}

describe("workspace ticket access scopes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
  });

  it("allows a team-scoped staff member and limits tickets to readable teams", async () => {
    (prisma.userRoleAssignment.findMany as jest.Mock).mockResolvedValue([
      assignment(12, [
        SUPPORT_PERMISSIONS.WORKSPACE_ACCESS,
        SUPPORT_PERMISSIONS.TICKET_READ,
      ]),
    ]);

    await expect(
      listWorkspaceTickets({
        actorUserId: 7,
        query: { limit: 8, ownership: "ALL" },
      }),
    ).resolves.toEqual({
      tickets: [],
      page: { limit: 8, hasMore: false, nextCursor: null },
    });
    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { supportTeamId: { in: [12] } },
                {
                  workItems: {
                    some: {
                      supportTeamId: { in: [12] },
                      status: "OPEN",
                    },
                  },
                },
              ],
            },
          ]),
        }),
      }),
    );
  });

  it("rejects disjoint workspace and ticket-read team scopes", async () => {
    (prisma.userRoleAssignment.findMany as jest.Mock).mockResolvedValue([
      assignment(12, [SUPPORT_PERMISSIONS.WORKSPACE_ACCESS]),
      assignment(13, [SUPPORT_PERMISSIONS.TICKET_READ]),
    ]);

    await expect(
      listWorkspaceTickets({
        actorUserId: 7,
        query: { limit: 8, ownership: "ALL" },
      }),
    ).rejects.toMatchObject({ kind: "NOT_FOUND" });
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
  });
});
