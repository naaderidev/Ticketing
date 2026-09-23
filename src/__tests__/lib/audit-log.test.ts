import { prisma } from "@/lib/prisma";
import { recordAuditEvent, recordRequiredAuditEvent } from "@/lib/audit-log";

jest.mock("@/lib/prisma", () => ({ prisma: { auditEvent: { create: jest.fn() } } }));
jest.mock("@/lib/request-security", () => ({
  getRequestId: jest.fn(() => "951fd209-d275-4402-a91f-f94306e76dd0"),
  getRequestSourceHash: jest.fn(() => "a".repeat(64)),
}));

describe("audit persistence modes", () => {
  const input = {
    request: new Request("http://localhost/api/test"),
    action: "REPORTING_EXPORT",
    outcome: "SUCCESS" as const,
    actorUserId: 7,
  };

  it("keeps ordinary audit best-effort", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    (prisma.auditEvent.create as jest.Mock).mockRejectedValue(new Error("db unavailable"));
    await expect(recordAuditEvent(input)).resolves.toBeUndefined();
    consoleError.mockRestore();
  });

  it("fails closed for security-critical export audit", async () => {
    (prisma.auditEvent.create as jest.Mock).mockRejectedValue(new Error("db unavailable"));
    await expect(recordRequiredAuditEvent(input)).rejects.toThrow("db unavailable");
  });
});
