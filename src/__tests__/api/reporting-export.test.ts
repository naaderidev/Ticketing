import { GET } from "@/app/api/v2/reporting/exports/[reportType]/route";
import { recordAuditEvent, recordRequiredAuditEvent } from "@/lib/audit-log";
import { getAutomatedResolutionReport } from "@/modules/reporting/application/automated-resolution-report-service";
import { hasReportingExportPermissionForScope, resolveReportingAccessScope } from "@/modules/reporting/application/reporting-authorization";
import { getQualityReport } from "@/modules/reporting/application/quality-report-service";
import { getRecurringProblemsReport } from "@/modules/reporting/application/recurring-problem-service";
import { getTicketPerTransactionReport } from "@/modules/reporting/application/ticket-per-transaction-report-service";
import { getTimeSlaReport } from "@/modules/reporting/application/time-sla-report-service";
import { requireReportingApiV2User } from "@/modules/shared/api-v2-authorization";

jest.mock("@/lib/audit-log", () => ({ recordAuditEvent: jest.fn(), recordRequiredAuditEvent: jest.fn() }));
jest.mock("@/modules/reporting/application/reporting-authorization", () => ({
  resolveReportingAccessScope: jest.fn(),
  hasReportingExportPermissionForScope: jest.fn(),
}));
jest.mock("@/modules/reporting/application/automated-resolution-report-service", () => ({ getAutomatedResolutionReport: jest.fn() }));
jest.mock("@/modules/reporting/application/quality-report-service", () => ({ getQualityReport: jest.fn() }));
jest.mock("@/modules/reporting/application/recurring-problem-service", () => ({ getRecurringProblemsReport: jest.fn() }));
jest.mock("@/modules/reporting/application/ticket-per-transaction-report-service", () => ({ getTicketPerTransactionReport: jest.fn() }));
jest.mock("@/modules/reporting/application/time-sla-report-service", () => ({ getTimeSlaReport: jest.fn() }));
jest.mock("@/modules/shared/api-v2-authorization", () => ({ requireReportingApiV2User: jest.fn() }));

const scope = { type: "GLOBAL" as const, accessMode: "MANAGEMENT" as const, teamIds: null };
const url = "http://localhost/api/v2/reporting/exports/quality?from=2026-09-01T00%3A00%3A00Z&to=2026-10-01T00%3A00%3A00Z";

describe("reporting export API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireReportingApiV2User as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 7, sessionId: "session-7" },
    });
    (resolveReportingAccessScope as jest.Mock).mockResolvedValue(scope);
    (hasReportingExportPermissionForScope as jest.Mock).mockResolvedValue(true);
    (getQualityReport as jest.Mock).mockResolvedValue({
      definitionVersion: "KPI-V1",
      customerSatisfaction: { score: 4.2 },
    });
  });

  it("returns a private formula-safe CSV only after required audit succeeds", async () => {
    const request = new Request(url, { headers: { "x-request-id": "951fd209-d275-4402-a91f-f94306e76dd0" } });
    const response = await GET(request, { params: Promise.resolve({ reportType: "quality" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="kpi-quality.csv"');
    expect((response as unknown as { body: string }).body).toContain(
      '"customerSatisfaction.score","4.2"'
    );
    expect(recordRequiredAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "REPORTING_EXPORT",
      outcome: "SUCCESS",
      actorUserId: 7,
      targetId: "quality",
    }));
    expect(getTimeSlaReport).not.toHaveBeenCalled();
    expect(getAutomatedResolutionReport).not.toHaveBeenCalled();
    expect(getTicketPerTransactionReport).not.toHaveBeenCalled();
    expect(getRecurringProblemsReport).not.toHaveBeenCalled();
  });

  it("denies and audits an account without export permission before reading KPI data", async () => {
    (hasReportingExportPermissionForScope as jest.Mock).mockResolvedValue(false);
    const response = await GET(new Request(url), { params: Promise.resolve({ reportType: "quality" }) });
    expect(response.status).toBe(403);
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: "DENIED" }));
    expect(getQualityReport).not.toHaveBeenCalled();
  });

  it("fails closed when mandatory export audit persistence fails", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    (recordRequiredAuditEvent as jest.Mock).mockRejectedValue(new Error("audit unavailable"));
    const response = await GET(new Request(url), { params: Promise.resolve({ reportType: "quality" }) });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
    consoleError.mockRestore();
  });
});
