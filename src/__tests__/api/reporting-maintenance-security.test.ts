import { POST } from "@/app/api/internal/reporting/process/route";
import { consumeRateLimit } from "@/lib/rate-limit";
import { processReportingProjection } from "@/modules/reporting/application/reporting-projection-service";

jest.mock("@/lib/reporting-config", () => ({
  getReportingConfig: jest.fn(() => ({
    maintenanceToken: "test-reporting-token-with-at-least-32-characters",
    batchSize: 100,
    leaseSeconds: 120,
    maxRebuildEvents: 100_000,
  })),
}));
jest.mock("@/lib/feature-flags", () => ({
  isReportingProjectionEnabled: jest.fn(() => true),
}));
jest.mock("@/lib/rate-limit", () => ({ consumeRateLimit: jest.fn() }));
jest.mock("@/lib/audit-log", () => ({ recordAuditEvent: jest.fn() }));
jest.mock("@/lib/request-security", () => ({
  getRequestSourceHash: jest.fn(() => "source"),
}));
jest.mock("@/modules/reporting/application/reporting-projection-service", () => ({
  processReportingProjection: jest.fn(),
}));

describe("reporting projection maintenance endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (consumeRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 60,
    });
  });

  it("denies a request without the dedicated bearer credential", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal/reporting/process", {
        method: "POST",
      })
    );
    expect(response.status).toBe(401);
    expect(processReportingProjection).not.toHaveBeenCalled();
  });

  it("runs the projection with the correct credential", async () => {
    (processReportingProjection as jest.Mock).mockResolvedValue({
      acquired: true,
      processed: 4,
      applied: 3,
      ignored: 1,
      replayed: 0,
      matured: 0,
      hasMore: false,
      status: "HEALTHY",
      lastOutboxEventId: "42",
    });
    const response = await POST(
      new Request("http://localhost/api/internal/reporting/process", {
        method: "POST",
        headers: {
          Authorization:
            "Bearer test-reporting-token-with-at-least-32-characters",
        },
      })
    );
    expect(response.status).toBe(200);
    expect(processReportingProjection).toHaveBeenCalledTimes(1);
  });
});
