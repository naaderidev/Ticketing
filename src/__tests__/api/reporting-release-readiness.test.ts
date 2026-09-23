import { GET } from "@/app/api/internal/reporting/readiness/route";
import { consumeRateLimit } from "@/lib/rate-limit";
import { reconcileReportingProjection } from "@/modules/reporting/application/reporting-reconciliation-service";

jest.mock("@/lib/reporting-config", () => ({
  getReportingConfig: jest.fn(() => ({
    maintenanceToken: "test-reporting-token-with-at-least-32-characters",
    batchSize: 100,
    leaseSeconds: 120,
    maxRebuildEvents: 100_000,
    rebuildSleepMilliseconds: 0,
  })),
}));
jest.mock("@/lib/reporting-rollout-config", () => ({
  getReportingRolloutConfig: jest.fn(() => ({
    stage: "CANARY",
    projectionEnabled: true,
    apiEnabled: true,
    canaryUserIds: new Set([7]),
  })),
}));
jest.mock("@/lib/rate-limit", () => ({ consumeRateLimit: jest.fn() }));
jest.mock("@/lib/audit-log", () => ({ recordAuditEvent: jest.fn() }));
jest.mock("@/lib/request-security", () => ({
  getRequestSourceHash: jest.fn(() => "source"),
}));
jest.mock(
  "@/modules/reporting/application/reporting-reconciliation-service",
  () => ({ reconcileReportingProjection: jest.fn() })
);

describe("Reporting release readiness endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (consumeRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 60,
    });
  });

  it("denies unauthenticated access without running reconciliation", async () => {
    const response = await GET(
      new Request("http://localhost/api/internal/reporting/readiness")
    );
    expect(response.status).toBe(401);
    expect(reconcileReportingProjection).not.toHaveBeenCalled();
  });

  it("returns a no-store, PII-free readiness summary", async () => {
    (reconcileReportingProjection as jest.Mock).mockResolvedValue({
      schemaVersion: 1,
      generatedAt: "2026-09-15T00:00:00.000Z",
      ready: true,
      definitionVersion: "KPI-V1",
      sourceHighWatermark: "511",
      counts: { sourceEvents: 59, processedEvents: 59 },
      checkpoint: { status: "HEALTHY", leaseActive: false },
      checks: [],
      blockers: [],
      warnings: ["HEALTHY_FACT_COVERAGE"],
    });
    const response = await GET(
      new Request("http://localhost/api/internal/reporting/readiness", {
        headers: {
          Authorization:
            "Bearer test-reporting-token-with-at-least-32-characters",
        },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.rollout).toEqual({
      stage: "CANARY",
      projectionEnabled: true,
      apiEnabled: true,
      canaryActorCount: 1,
    });
    expect(body.reconciliation.ready).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(
      /mobile|nationalCode|subject|message|fileName/i
    );
  });
});
