import { POST } from "@/app/api/internal/reporting/recurring-problems/process/route";
import { isRecurringProblemDetectionEnabled } from "@/lib/feature-flags";
import { consumeRateLimit } from "@/lib/rate-limit";
import { generateRecurringProblemSignals } from "@/modules/reporting/application/recurring-problem-service";

jest.mock("@/lib/reporting-config", () => ({
  getReportingConfig: jest.fn(() => ({ maintenanceToken: "test-reporting-token-with-at-least-32-characters" })),
}));
jest.mock("@/lib/feature-flags", () => ({
  isRecurringProblemDetectionEnabled: jest.fn(() => true),
}));
jest.mock("@/lib/rate-limit", () => ({ consumeRateLimit: jest.fn() }));
jest.mock("@/lib/audit-log", () => ({ recordAuditEvent: jest.fn() }));
jest.mock("@/lib/request-security", () => ({ getRequestSourceHash: jest.fn(() => "source") }));
jest.mock("@/modules/reporting/application/recurring-problem-service", () => ({
  generateRecurringProblemSignals: jest.fn(),
}));

const url = "http://localhost/api/internal/reporting/recurring-problems/process";

describe("recurring problem maintenance endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (consumeRateLimit as jest.Mock).mockResolvedValue({ allowed: true, retryAfterSeconds: 60 });
    (isRecurringProblemDetectionEnabled as jest.Mock).mockReturnValue(true);
  });

  it("rejects requests without the dedicated bearer credential", async () => {
    const response = await POST(new Request(url, { method: "POST" }));
    expect(response.status).toBe(401);
    expect(generateRecurringProblemSignals).not.toHaveBeenCalled();
  });

  it("fails closed while the explicit rollout flag is disabled", async () => {
    (isRecurringProblemDetectionEnabled as jest.Mock).mockReturnValue(false);
    const response = await POST(new Request(url, {
      method: "POST",
      headers: { Authorization: "Bearer test-reporting-token-with-at-least-32-characters" },
    }));
    expect(response.status).toBe(503);
    expect(generateRecurringProblemSignals).not.toHaveBeenCalled();
  });

  it("generates signals after authentication and rollout approval", async () => {
    (generateRecurringProblemSignals as jest.Mock).mockResolvedValue({ generated: 2, recurring: 1 });
    const response = await POST(new Request(url, {
      method: "POST",
      headers: { Authorization: "Bearer test-reporting-token-with-at-least-32-characters" },
    }));
    expect(response.status).toBe(200);
    expect(generateRecurringProblemSignals).toHaveBeenCalledTimes(1);
  });
});
