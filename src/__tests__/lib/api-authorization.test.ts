import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import {
  requireAdmin,
  requireActiveRole,
  requireGlobalPermission,
  requireNotificationAccess,
  requireTicketPermission,
} from "@/lib/api-authorization";
import { consumeRateLimit } from "@/lib/rate-limit";

jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({
      status: init?.status || 200,
      headers: new Headers(init?.headers),
      json: () => Promise.resolve(body),
    })),
  },
}));

jest.mock("@/lib/current-user", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    ticket: { findUnique: jest.fn() },
    notification: { findUnique: jest.fn() },
    userRoleAssignment: { findFirst: jest.fn() },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: jest.fn(),
}));

const sessionUser = { id: 10, mobile: "09120000000", role: "USER" as const };
const databaseUser = {
  ...sessionUser,
  firstName: "کاربر",
  lastName: "آزمایشی",
  sessionId: "4f1cd431-0dbf-4c2d-854c-1de9d6058208",
};

describe("API authorization", () => {
  beforeEach(() => {
    (getCurrentUser as jest.Mock).mockResolvedValue(databaseUser);
  });

  it("rejects unauthenticated requests", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValueOnce(null);

    const result = await requireAdmin();

    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.response.status).toBe(401);
  });

  it("uses the current database role instead of the token role", async () => {
    const result = await requireAdmin();

    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.response.status).toBe(403);
  });

  it("returns 429 when the durable mutation bucket is exhausted", async () => {
    (consumeRateLimit as jest.Mock).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 17,
    });

    const result = await requireAdmin({
      rateLimit: { scope: "test", limit: 1, windowSeconds: 60 },
    });

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(429);
      expect(result.response.headers.get("Retry-After")).toBe("17");
    }
  });

  it("authorizes a global permission only when an active grant exists", async () => {
    (prisma.userRoleAssignment.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 44,
    });

    const result = await requireGlobalPermission("support.catalog.manage");

    expect(result.authorized).toBe(true);
    expect(prisma.userRoleAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: databaseUser.id,
          scopeType: "GLOBAL",
          scopeKey: "*",
        }),
      }),
    );
  });

  it("rejects a missing staff role assignment", async () => {
    (prisma.userRoleAssignment.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const result = await requireActiveRole("SYSTEM_ADMINISTRATOR");

    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.response.status).toBe(403);
  });

  it("hides another user's ticket", async () => {
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 20,
      ticketId: "TK-OTHER",
      userId: 99,
      status: "OPEN",
    });

    const result = await requireTicketPermission("TK-OTHER", "read");

    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.response.status).toBe(404);
  });

  it("allows a user to access their own ticket", async () => {
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 20,
      ticketId: "TK-OWN",
      userId: sessionUser.id,
      status: "OPEN",
    });

    const result = await requireTicketPermission("TK-OWN", "read");

    expect(result.authorized).toBe(true);
  });

  it("hides another user's notification", async () => {
    (prisma.notification.findUnique as jest.Mock).mockResolvedValueOnce({
      userId: 99,
      recipientType: "USER",
    });

    const result = await requireNotificationAccess(30);

    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.response.status).toBe(404);
  });
});
