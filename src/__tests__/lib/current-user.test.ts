import { getSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

jest.mock("@/lib/auth", () => ({
  getSessionToken: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findFirst: jest.fn() },
  },
}));

describe("current user DAL", () => {
  it("returns null without a valid session", async () => {
    (getSessionToken as jest.Mock).mockResolvedValueOnce(null);

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(prisma.session.findFirst).not.toHaveBeenCalled();
  });

  it("returns the current database identity and role", async () => {
    (getSessionToken as jest.Mock).mockResolvedValueOnce({
      userId: 4,
      sessionId: "4f1cd431-0dbf-4c2d-854c-1de9d6058208",
    });
    (prisma.session.findFirst as jest.Mock).mockResolvedValueOnce({
      id: "4f1cd431-0dbf-4c2d-854c-1de9d6058208",
      user: {
        id: 4,
        mobile: "09120000000",
        firstName: "مدیر",
        lastName: "جدید",
        role: "ADMIN",
      },
    });

    await expect(getCurrentUser()).resolves.toMatchObject({
      id: 4,
      role: "ADMIN",
    });
    expect(prisma.session.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "4f1cd431-0dbf-4c2d-854c-1de9d6058208",
          userId: 4,
          revokedAt: null,
        }),
      })
    );
  });
});
