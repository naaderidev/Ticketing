import { POST } from "@/app/api/internal/reporting/transaction-volumes/route";
import { consumeRateLimit } from "@/lib/rate-limit";
import { ingestTransactionVolumes } from "@/modules/reporting/application/transaction-volume-ingestion-service";

jest.mock("@/lib/reporting-config", () => ({
  getReportingConfig: jest.fn(() => ({ maintenanceToken: "test-reporting-token-with-at-least-32-characters" })),
}));
jest.mock("@/lib/feature-flags", () => ({ isTransactionVolumeIngestionEnabled: jest.fn(() => true) }));
jest.mock("@/lib/rate-limit", () => ({ consumeRateLimit: jest.fn() }));
jest.mock("@/lib/audit-log", () => ({ recordAuditEvent: jest.fn() }));
jest.mock("@/lib/request-security", () => ({ getRequestSourceHash: jest.fn(() => "source") }));
jest.mock("@/modules/reporting/application/transaction-volume-ingestion-service", () => ({ ingestTransactionVolumes: jest.fn() }));

const body = {
  providerCode: "PAYMENT_CORE",
  sourceVersion: "daily-v1",
  rows: [{
    transactionType: "PAYMENT",
    localDate: "2026-09-15",
    bucketStartedAt: "2026-09-14T20:30:00.000Z",
    bucketEndedAt: "2026-09-15T20:30:00.000Z",
    scopeType: "GLOBAL",
    successfulTransactionCount: "10000",
    status: "VERIFIED",
  }],
};

function request(token?: string) {
  return new Request("http://localhost/api/internal/reporting/transaction-volumes", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

describe("transaction-volume ingestion endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (consumeRateLimit as jest.Mock).mockResolvedValue({ allowed: true, retryAfterSeconds: 60 });
  });

  it("denies requests without the maintenance credential", async () => {
    expect((await POST(request())).status).toBe(401);
    expect(ingestTransactionVolumes).not.toHaveBeenCalled();
  });

  it("validates and ingests an authorized batch", async () => {
    (ingestTransactionVolumes as jest.Mock).mockResolvedValue({
      providerCode: "PAYMENT_CORE", sourceVersion: "daily-v1", received: 1, inserted: 1, replayed: 0, statusUpdated: 0,
    });
    const response = await POST(request("test-reporting-token-with-at-least-32-characters"));
    expect(response.status).toBe(201);
    expect(ingestTransactionVolumes).toHaveBeenCalledWith(expect.objectContaining({ providerCode: "PAYMENT_CORE" }));
  });
});
