import { prisma } from "@/lib/prisma";
import {
  getAvailablePartyContexts,
  switchActivePartyContext,
} from "@/modules/organizations/application/party-context-service";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    personProfile: { findUnique: jest.fn() },
    organizationMembership: { findMany: jest.fn() },
    session: { updateMany: jest.fn() },
  },
}));

const currentUser = {
  id: 7,
  firstName: "کاربر",
  lastName: "آزمایشی",
  mobile: "09120000000",
  role: "USER" as const,
  sessionId: "4f1cd431-0dbf-4c2d-854c-1de9d6058208",
};

describe("party context service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.personProfile.findUnique as jest.Mock).mockResolvedValue({
      party: { id: 70, displayName: "کاربر آزمایشی" },
    });
    (prisma.organizationMembership.findMany as jest.Mock).mockResolvedValue([]);
  });

  it("derives organization contexts from the authenticated user id", async () => {
    await expect(getAvailablePartyContexts(currentUser.id)).resolves.toEqual([
      {
        partyId: 70,
        type: "PERSON",
        displayName: "کاربر آزمایشی",
        organization: null,
      },
    ]);

    expect(prisma.organizationMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: currentUser.id }),
      })
    );
  });

  it("does not persist a party id outside the user's authorized contexts", async () => {
    await expect(
      switchActivePartyContext({ user: currentUser, partyId: 999 })
    ).rejects.toMatchObject({ kind: "NOT_FOUND" });

    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it("updates only the authenticated and still-active session", async () => {
    (prisma.session.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await expect(
      switchActivePartyContext({ user: currentUser, partyId: 70 })
    ).resolves.toMatchObject({ partyId: 70, type: "PERSON" });

    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: currentUser.sessionId,
        userId: currentUser.id,
        revokedAt: null,
      }),
      data: { activePartyId: 70 },
    });
  });
});
