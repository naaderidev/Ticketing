import { POST } from "@/app/api/users/demo-login/route";
import { createAuthSession, revokeCurrentSession } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { findUserByMobile } from "@/lib/user-service";

jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({
      status: init?.status || 200,
      headers: new Headers(init?.headers),
      json: () => Promise.resolve(body),
    })),
  },
}));

jest.mock("@/lib/auth", () => ({
  createAuthSession: jest.fn(),
  revokeCurrentSession: jest.fn(),
}));
jest.mock("@/lib/rate-limit", () => ({ consumeRateLimit: jest.fn() }));
jest.mock("@/lib/user-service", () => ({ findUserByMobile: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    userRoleAssignment: { findFirst: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
  },
}));
jest.mock("@/lib/audit-log", () => ({ recordAuditEvent: jest.fn() }));
jest.mock("@/lib/request-security", () => ({
  getRequestSourceHash: jest.fn(() => "source-hash"),
}));

function requestFor(accountKey: string) {
  return new Request("http://localhost/api/users/demo-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountKey }),
  });
}

describe("demo account login API", () => {
  beforeEach(() => {
    (consumeRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 60,
    });
    (revokeCurrentSession as jest.Mock).mockResolvedValue(null);
    (createAuthSession as jest.Mock).mockResolvedValue("session-id");
  });

  it("creates a staff session and returns the persona-owned destination", async () => {
    const { prisma } = jest.requireMock("@/lib/prisma");
    prisma.userRoleAssignment.findFirst.mockResolvedValue({ id: 10 });
    (findUserByMobile as jest.Mock).mockResolvedValue({
      id: 1,
      firstName: "امید",
      lastName: "علوی",
      email: "system.admin@ticketito.demo",
      role: "ADMIN",
    });

    const response = await POST(requestFor("system-administrator"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      role: "ADMIN",
      redirectTo: "/admin/organizations",
    });
    expect(revokeCurrentSession).toHaveBeenCalledTimes(1);
    expect(createAuthSession).toHaveBeenCalledWith(1);
  });

  it("creates a company manager session with an active organization role", async () => {
    const { prisma } = jest.requireMock("@/lib/prisma");
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 20 });
    (findUserByMobile as jest.Mock).mockResolvedValue({
      id: 8,
      firstName: "زهرا",
      lastName: "رضایی",
      email: "organization.manager@ticketito.demo",
      role: "USER",
    });

    const response = await POST(requestFor("organization-manager"));

    await expect(response.json()).resolves.toMatchObject({
      role: "USER",
      redirectTo: "/user",
    });
    expect(createAuthSession).toHaveBeenCalledWith(8);
  });

  it("rejects unknown or non-seeded demo accounts", async () => {
    const unknownResponse = await POST(requestFor("unknown-persona"));
    expect(unknownResponse.status).toBe(404);

    (findUserByMobile as jest.Mock).mockResolvedValue(null);
    const missingResponse = await POST(requestFor("individual-customer-1"));
    expect(missingResponse.status).toBe(404);
    expect(createAuthSession).not.toHaveBeenCalled();
  });

  it("enforces a dedicated source rate limit", async () => {
    (consumeRateLimit as jest.Mock).mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 120,
    });

    const response = await POST(requestFor("customer-1"));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(findUserByMobile).not.toHaveBeenCalled();
  });
});
