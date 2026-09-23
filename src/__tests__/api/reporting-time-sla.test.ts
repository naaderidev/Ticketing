import { GET } from "@/app/api/v2/reporting/kpis/time-sla/route";
import { getTimeSlaReport } from "@/modules/reporting/application/time-sla-report-service";
import { ReportingKpiError } from "@/modules/reporting/domain/reporting-kpi-error";
import { requireReportingApiV2User } from "@/modules/shared/api-v2-authorization";

jest.mock("@/modules/reporting/application/time-sla-report-service", () => ({
  getTimeSlaReport: jest.fn(),
}));
jest.mock("@/modules/shared/api-v2-authorization", () => ({
  requireReportingApiV2User: jest.fn(),
}));

const validUrl =
  "http://localhost/api/v2/reporting/kpis/time-sla?from=2026-09-01T00%3A00%3A00Z&to=2026-10-01T00%3A00%3A00Z";

describe("time and SLA reporting API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireReportingApiV2User as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 7 },
    });
  });

  it("returns the versioned report with private no-store headers", async () => {
    (getTimeSlaReport as jest.Mock).mockResolvedValue({
      definitionVersion: "KPI-V1",
    });

    const response = await GET(new Request(validUrl));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      data: { definitionVersion: "KPI-V1" },
      meta: { requestId: expect.any(String) },
    });
    expect(getTimeSlaReport).toHaveBeenCalledWith({
      actorUserId: 7,
      range: {
        from: new Date("2026-09-01T00:00:00.000Z"),
        to: new Date("2026-10-01T00:00:00.000Z"),
      },
    });
  });

  it("rejects an invalid range before querying reporting data", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/v2/reporting/kpis/time-sla?from=2026-10-01T00%3A00%3A00Z&to=2026-09-01T00%3A00%3A00Z"
      )
    );
    expect(response.status).toBe(400);
    expect(getTimeSlaReport).not.toHaveBeenCalled();
  });

  it("returns a stable forbidden response for a user outside reporting scope", async () => {
    (getTimeSlaReport as jest.Mock).mockRejectedValue(
      new ReportingKpiError(
        "دسترسی به گزارش‌های مدیریتی مجاز نیست",
        "FORBIDDEN",
        403
      )
    );
    const response = await GET(new Request(validUrl));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
  });
});
