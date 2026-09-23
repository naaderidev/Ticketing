import { runSerializableTransaction } from "@/lib/database-transaction";
import { prisma } from "@/lib/prisma";
import {
  approveOrganizationAccessRequest,
  listOrganizationAccessRequests,
  listOrganizationMemberships,
  listOrganizations,
} from "@/modules/organizations/application/organization-service";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    userRoleAssignment: { findFirst: jest.fn() },
    organizationMembership: { findUnique: jest.fn() },
    organization: { findFirst: jest.fn(), findMany: jest.fn() },
    organizationAccessRequest: { findMany: jest.fn() },
  },
}));
jest.mock("@/lib/database-transaction", () => ({
  runSerializableTransaction: jest.fn(),
}));

const activeManagerMembership = {
  id: 13,
  role: "MANAGER" as const,
  status: "ACTIVE" as const,
  validFrom: new Date("2026-01-01T00:00:00.000Z"),
  validTo: null,
};

describe("organization service tenant isolation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.userRoleAssignment.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.organizationMembership.findUnique as jest.Mock).mockResolvedValue(
      null
    );
  });

  it("hides an organization when the actor has no membership in that tenant", async () => {
    await expect(
      listOrganizationMemberships({ actorUserId: 7, organizationId: 20 })
    ).rejects.toMatchObject({ kind: "NOT_FOUND" });

    expect(prisma.organizationMembership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_userId: { organizationId: 20, userId: 7 } },
      })
    );
    expect(prisma.organization.findFirst).not.toHaveBeenCalled();
  });

  it("lists only organizations managed by a non-global actor", async () => {
    (prisma.organization.findMany as jest.Mock).mockResolvedValue([]);

    await expect(
      listOrganizations({
        actorUserId: 7,
        now: new Date("2026-09-13T10:00:00.000Z"),
      })
    ).resolves.toEqual([]);

    expect(prisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          memberships: {
            some: expect.objectContaining({
              userId: 7,
              role: "MANAGER",
              status: "ACTIVE",
            }),
          },
        }),
      })
    );
  });

  it("keeps access-request queries scoped to the authorized organization", async () => {
    (prisma.organizationMembership.findUnique as jest.Mock).mockResolvedValue(
      activeManagerMembership
    );
    (prisma.organizationAccessRequest.findMany as jest.Mock).mockResolvedValue(
      []
    );

    await expect(
      listOrganizationAccessRequests({ actorUserId: 7, organizationId: 20 })
    ).resolves.toEqual([]);
    expect(prisma.organizationAccessRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 20 } })
    );
  });

  it("rejects self-approval before applying any membership mutation", async () => {
    const transaction = {
      organizationAccessRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 4,
          organizationId: 20,
          requestedById: 7,
          targetUserId: 8,
          requestType: "ADD_MEMBERSHIP",
          requestedRole: "REPRESENTATIVE",
          status: "PENDING",
          scopes: [{ type: "ORGANIZATION", scopeKey: "*" }],
        }),
        update: jest.fn(),
      },
      userRoleAssignment: {
        findFirst: jest.fn().mockResolvedValue({ id: 1 }),
      },
      organizationMembership: {
        findUnique: jest.fn().mockResolvedValue(activeManagerMembership),
      },
    };
    (runSerializableTransaction as jest.Mock).mockImplementation((operation) =>
      operation(transaction)
    );

    await expect(
      approveOrganizationAccessRequest({
        actorUserId: 7,
        requestId: 4,
        decisionReason: "بررسی و تأیید درخواست",
      })
    ).rejects.toMatchObject({ kind: "NOT_FOUND" });
    expect(transaction.organizationAccessRequest.update).not.toHaveBeenCalled();
  });

  it("prevents removal of the last currently valid organization manager", async () => {
    const transaction = {
      organizationAccessRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 5,
          organizationId: 20,
          requestedById: 6,
          targetUserId: 8,
          requestType: "CHANGE_ROLE",
          requestedRole: "REPRESENTATIVE",
          status: "PENDING",
          scopes: [],
        }),
        update: jest.fn(),
      },
      userRoleAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      organizationMembership: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(activeManagerMembership)
          .mockResolvedValueOnce({ ...activeManagerMembership, userId: 8 })
          .mockResolvedValueOnce({ ...activeManagerMembership, userId: 8 }),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn(),
      },
    };
    (runSerializableTransaction as jest.Mock).mockImplementation((operation) =>
      operation(transaction)
    );

    await expect(
      approveOrganizationAccessRequest({
        actorUserId: 7,
        requestId: 5,
        decisionReason: "تنزل نقش مدیر فعلی",
      })
    ).rejects.toMatchObject({ kind: "CONFLICT" });
    expect(transaction.organizationMembership.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: 20,
        role: "MANAGER",
        status: "ACTIVE",
        validFrom: expect.any(Object),
      }),
    });
    expect(transaction.organizationMembership.update).not.toHaveBeenCalled();
  });
});
