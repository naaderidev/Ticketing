import { POST } from "@/app/api/internal/tickets/lifecycle/process/route";
import { consumeRateLimit } from "@/lib/rate-limit";
import { runTicketLifecycleMaintenance } from "@/modules/tickets/application/ticket-lifecycle-service";

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
jest.mock("@/lib/request-security", () => ({ getRequestSourceHash: jest.fn(() => "source") }));
jest.mock("@/modules/tickets/application/ticket-lifecycle-service", () => ({ runTicketLifecycleMaintenance: jest.fn() }));

describe("ticket lifecycle maintenance endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (consumeRateLimit as jest.Mock).mockResolvedValue({ allowed: true, retryAfterSeconds: 60 });
  });

  it("fails closed without the maintenance credential", async () => {
    const response = await POST(new Request("http://localhost/api/internal/tickets/lifecycle/process", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(runTicketLifecycleMaintenance).not.toHaveBeenCalled();
  });

  it("runs one bounded lifecycle batch with the valid credential", async () => {
    (runTicketLifecycleMaintenance as jest.Mock).mockResolvedValue({ backfill: { evaluated: 0, created: 0 }, evaluated: 0, reminders: 0, closed: 0 });
    const response = await POST(new Request("http://localhost/api/internal/tickets/lifecycle/process", { method: "POST", headers: { Authorization: "Bearer test-sla-token-with-at-least-32-characters" } }));
    expect(response.status).toBe(200);
    expect(runTicketLifecycleMaintenance).toHaveBeenCalledWith(100);
  });
});
