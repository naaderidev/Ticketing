import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signToken, verifyToken } from "@/lib/auth-token";
import {
  createAuthSession,
  refreshAuthSession,
  revokeCurrentSession,
} from "@/lib/auth";

jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    personProfile: {
      findUnique: jest.fn(),
    },
    session: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));
jest.mock("@/lib/auth-token", () => ({
  signToken: jest.fn(() => Promise.resolve("signed-token")),
  verifyToken: jest.fn(),
}));

const cookieStore = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};

describe("revocable authentication sessions", () => {
  const originalNodeEnvironment = process.env.NODE_ENV;
  const originalDemoMode = process.env.DEMO_MODE;

  beforeEach(() => {
    (cookies as jest.Mock).mockResolvedValue(cookieStore);
    cookieStore.set.mockClear();
  });

  afterEach(() => {
    process.env = {
      ...process.env,
      NODE_ENV: originalNodeEnvironment,
    };
    if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = originalDemoMode;
  });

  it("persists a session before issuing its cookie", async () => {
    (prisma.personProfile.findUnique as jest.Mock).mockResolvedValue({
      partyId: 17,
    });
    (prisma.session.create as jest.Mock).mockResolvedValue({});

    const sessionId = await createAuthSession(7);

    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(prisma.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: sessionId,
        userId: 7,
        activePartyId: 17,
      }),
    });
    expect(signToken).toHaveBeenCalledWith({ userId: 7, sessionId });
    expect(cookieStore.set).toHaveBeenCalledWith(
      "auth-token",
      "signed-token",
      expect.objectContaining({ httpOnly: true, sameSite: "strict" })
    );
  });

  it("issues an HTTP-compatible cookie in production demo mode", async () => {
    process.env = {
      ...process.env,
      NODE_ENV: "production",
      DEMO_MODE: "true",
    };
    (prisma.personProfile.findUnique as jest.Mock).mockResolvedValue({
      partyId: 17,
    });
    (prisma.session.create as jest.Mock).mockResolvedValue({});

    await createAuthSession(7);

    expect(cookieStore.set).toHaveBeenCalledWith(
      "auth-token",
      "signed-token",
      expect.objectContaining({ secure: false })
    );
  });

  it("revokes the current database session", async () => {
    cookieStore.get.mockReturnValue({ value: "token" });
    (verifyToken as jest.Mock).mockResolvedValue({
      userId: 7,
      sessionId: "4f1cd431-0dbf-4c2d-854c-1de9d6058208",
    });
    (prisma.session.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await expect(revokeCurrentSession()).resolves.toBe(
      "4f1cd431-0dbf-4c2d-854c-1de9d6058208"
    );
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null, userId: 7 }),
      })
    );
  });

  it("does not refresh a revoked or expired session", async () => {
    (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      refreshAuthSession({
        userId: 7,
        sessionId: "4f1cd431-0dbf-4c2d-854c-1de9d6058208",
      })
    ).resolves.toBe(false);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("refreshes an active session without exceeding its absolute lifetime", async () => {
    const absoluteExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    (prisma.session.findFirst as jest.Mock).mockResolvedValue({
      absoluteExpiresAt,
    });
    (prisma.session.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await expect(
      refreshAuthSession({
        userId: 7,
        sessionId: "4f1cd431-0dbf-4c2d-854c-1de9d6058208",
      })
    ).resolves.toBe(true);
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expiresAt: absoluteExpiresAt }),
      })
    );
    expect(cookieStore.set).toHaveBeenCalled();
  });
});
