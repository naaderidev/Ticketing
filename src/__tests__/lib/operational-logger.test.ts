import { createOperationalLogEntry } from "@/lib/operational-logger";

describe("operational logger", () => {
  it("keeps diagnostic identity while excluding raw error messages", () => {
    const error = new Error("DATABASE_URL=mysql://secret@example.test/db");
    Object.assign(error, { digest: "safe-digest-123" });

    const entry = createOperationalLogEntry({
      level: "error",
      event: "request_failed",
      error,
      context: { requestId: "123e4567-e89b-42d3-a456-426614174000" },
      timestamp: new Date("2026-09-13T00:00:00.000Z"),
      deploymentVersion: "commit-abc123",
    });
    const serialized = JSON.stringify(entry);

    expect(entry).toMatchObject({
      level: "error",
      event: "request_failed",
      errorType: "Error",
      errorDigest: "safe-digest-123",
      deploymentVersion: "commit-abc123",
    });
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toContain("secret@example.test");
  });

  it("does not let context override reserved log fields", () => {
    const entry = createOperationalLogEntry({
      level: "warn",
      event: "real_event",
      context: { level: "forged", event: "forged_event" },
      timestamp: new Date("2026-09-13T00:00:00.000Z"),
      deploymentVersion: "commit-abc123",
    });

    expect(entry.level).toBe("warn");
    expect(entry.event).toBe("real_event");
  });

  it("drops context fields whose names indicate sensitive data", () => {
    const entry = createOperationalLogEntry({
      level: "warn",
      event: "safe_event",
      context: {
        operation: "login",
        authorizationToken: "must-not-appear",
        mobile: "09120000000",
      },
      timestamp: new Date("2026-09-13T00:00:00.000Z"),
      deploymentVersion: "commit-abc123",
    });

    expect(entry.operation).toBe("login");
    expect(entry).not.toHaveProperty("authorizationToken");
    expect(entry).not.toHaveProperty("mobile");
  });
});
