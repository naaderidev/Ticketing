import { runSerializableTransaction } from "@/lib/database-transaction";
import { prisma } from "@/lib/prisma";
import {
  getCustomerSupportCatalog,
  getSupportManagementSnapshot,
  getSupportTeamMemberCandidates,
  getWorkspaceQueues,
  publishSupportCatalogRoute,
  reconcileLegacyCatalogMapping,
} from "@/modules/support-catalog/application/support-catalog-service";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    userRoleAssignment: { findFirst: jest.fn() },
    supportService: { findMany: jest.fn() },
    supportQueue: { findMany: jest.fn() },
    supportTeam: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    legacySupportCatalogMapping: { findMany: jest.fn() },
  },
}));
jest.mock("@/lib/database-transaction", () => ({
  runSerializableTransaction: jest.fn(),
}));

describe("support catalog service boundaries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.userRoleAssignment.findFirst as jest.Mock).mockResolvedValue(null);
  });

  it("returns the customer catalog without queue or team internals", async () => {
    (prisma.supportService.findMany as jest.Mock).mockResolvedValue([
      {
        id: 1,
        code: "FINANCE",
        name: "مالی",
        description: null,
        requestTypes: [
          {
            id: 2,
            code: "PAYMENT",
            name: "پرداخت",
            description: null,
            businessSubjectType: "INVOICE",
            requiresBusinessSubject: true,
            requiresRootCause: false,
            routes: [
              {
                version: 3,
                defaultPriority: "HIGH",
                slaPolicy: {
                  code: "BASE_HIGH",
                  version: 1,
                  clockType: "BUSINESS",
                  firstResponseMinutes: 120,
                  resolutionMinutes: 540,
                },
              },
            ],
          },
        ],
      },
    ]);

    const catalog = await getCustomerSupportCatalog();
    expect(catalog[0].requestTypes[0]).toMatchObject({ routeVersion: 3 });
    expect(catalog[0].requestTypes[0].slaPolicy).toMatchObject({
      code: "BASE_HIGH",
      version: 1,
    });
    expect(catalog[0].requestTypes[0]).not.toHaveProperty("queue");
    expect(catalog[0].requestTypes[0]).not.toHaveProperty("team");
  });

  it("hides the workspace and skips queue access without permission", async () => {
    await expect(getWorkspaceQueues({ actorUserId: 7 })).rejects.toMatchObject({
      kind: "NOT_FOUND",
    });
    expect(prisma.supportQueue.findMany).not.toHaveBeenCalled();
  });

  it("scopes a non-global agent queue query through active team assignments", async () => {
    (prisma.userRoleAssignment.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce(null);
    (prisma.supportQueue.findMany as jest.Mock).mockResolvedValue([]);

    await expect(
      getWorkspaceQueues({
        actorUserId: 7,
        now: new Date("2026-09-13T10:00:00.000Z"),
      })
    ).resolves.toEqual([]);
    expect(prisma.supportQueue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          team: expect.objectContaining({
            roleAssignments: {
              some: expect.objectContaining({
                userId: 7,
                scopeType: "SUPPORT_TEAM",
                status: "ACTIVE",
              }),
            },
          }),
        }),
      })
    );
  });

  it("does not expose management data without global catalog permission", async () => {
    await expect(getSupportManagementSnapshot(7)).rejects.toMatchObject({
      kind: "NOT_FOUND",
    });
    expect(prisma.supportService.findMany).not.toHaveBeenCalled();
  });

  it("returns only minimal member-candidate identity with team-management permission", async () => {
    (prisma.userRoleAssignment.findFirst as jest.Mock).mockResolvedValue({ id: 1 });
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 8, firstName: "زهرا", lastName: "رضایی" },
    ]);

    await expect(getSupportTeamMemberCandidates(7)).resolves.toEqual([
      { id: 8, firstName: "زهرا", lastName: "رضایی" },
    ]);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    });
  });

  it("does not expose member candidates without team-management permission", async () => {
    await expect(getSupportTeamMemberCandidates(7)).rejects.toMatchObject({
      kind: "NOT_FOUND",
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("refuses route publication when the request type has no single active predecessor", async () => {
    (prisma.userRoleAssignment.findFirst as jest.Mock).mockResolvedValue({ id: 1 });
    const transaction = {
      supportRequestType: { findFirst: jest.fn().mockResolvedValue({ id: 2 }) },
      supportQueue: { findFirst: jest.fn().mockResolvedValue({ id: 4 }) },
      supportCatalogRoute: {
        findFirst: jest.fn().mockResolvedValue({ version: 2 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(),
      },
      slaPolicy: {
        findFirst: jest.fn().mockResolvedValue({ id: 8 }),
      },
    };
    (runSerializableTransaction as jest.Mock).mockImplementation((operation) =>
      operation(transaction)
    );

    await expect(
      publishSupportCatalogRoute(1, 2, {
        queueId: 4,
        defaultPriority: "NORMAL",
        reason: "اصلاح مسیر صف",
      })
    ).rejects.toMatchObject({ kind: "CONFLICT" });
    expect(transaction.supportCatalogRoute.create).not.toHaveBeenCalled();
  });

  it("requires an explicit target when manually mapping a legacy department", async () => {
    (prisma.userRoleAssignment.findFirst as jest.Mock).mockResolvedValue({ id: 1 });
    const transaction = {
      legacySupportCatalogMapping: {
        findUnique: jest.fn().mockResolvedValue({ id: 9, sourceType: "DEPARTMENT" }),
        update: jest.fn(),
      },
    };
    (runSerializableTransaction as jest.Mock).mockImplementation((operation) =>
      operation(transaction)
    );

    await expect(
      reconcileLegacyCatalogMapping(1, 9, { status: "MAPPED" })
    ).rejects.toMatchObject({ kind: "VALIDATION" });
    expect(transaction.legacySupportCatalogMapping.update).not.toHaveBeenCalled();
  });
});
