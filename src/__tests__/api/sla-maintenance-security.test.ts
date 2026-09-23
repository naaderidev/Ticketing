import { POST } from "@/app/api/internal/sla/process/route";
import { consumeRateLimit } from "@/lib/rate-limit";
import { runSlaMaintenance } from "@/modules/sla-routing/application/sla-worker";

jest.mock("@/lib/sla-routing-config", () => ({
  getSlaRoutingConfig: jest.fn(() => ({
    maintenanceToken: "test-sla-token-with-at-least-32-characters",
    batchSize: 100,
    lockSeconds: 120,
    outboxMaxAttempts: 5,
  })),
}));
jest.mock("@/lib/rate-limit", () => ({ consumeRateLimit: jest.fn() }));
jest.mock("@/lib/audit-log", () => ({ recordAuditEvent: jest.fn() }));
jest.mock("@/lib/request-security", () => ({
  getRequestSourceHash: jest.fn(() => "source"),
}));
jest.mock("@/modules/sla-routing/application/sla-worker", () => ({
  runSlaMaintenance: jest.fn(),
}));

describe("SLA maintenance endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (consumeRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 60,
    });
  });

  it("denies a request without the dedicated bearer credential", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal/sla/process", { method: "POST" })
    );
    expect(response.status).toBe(401);
    expect(runSlaMaintenance).not.toHaveBeenCalled();
  });

  it("runs the bounded maintenance workflow with the correct credential", async () => {
    (runSlaMaintenance as jest.Mock).mockResolvedValue({
      backfill: { created: 0, skipped: 0 },
      thresholds: { evaluated: 0, eventsCreated: 0 },
      outbox: {
        enabled: false,
        seeded: 0,
        processed: 0,
        retried: 0,
        deadLettered: 0,
      },
    });
    const response = await POST(
      new Request("http://localhost/api/internal/sla/process", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-sla-token-with-at-least-32-characters",
        },
      })
    );
    expect(response.status).toBe(200);
    expect(runSlaMaintenance).toHaveBeenCalledTimes(1);
  });
});
