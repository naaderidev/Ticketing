import { GET } from "@/app/api/v2/reporting/kpis/recurring-problems/route";
import { getRecurringProblemsReport } from "@/modules/reporting/application/recurring-problem-service";
import { ReportingKpiError } from "@/modules/reporting/domain/reporting-kpi-error";
import { requireReportingApiV2User } from "@/modules/shared/api-v2-authorization";

jest.mock("@/modules/reporting/application/recurring-problem-service", () => ({
  getRecurringProblemsReport: jest.fn(),
}));
jest.mock("@/modules/shared/api-v2-authorization", () => ({
  requireReportingApiV2User: jest.fn(),
}));

const validUrl = "http://localhost/api/v2/reporting/kpis/recurring-problems?from=2026-09-01T00%3A00%3A00%2B03%3A30&to=2026-09-15T00%3A00%3A00%2B03%3A30&limit=25";

describe("recurring problems reporting API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireReportingApiV2User as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 7 },
    });
  });

  it("returns the private scoped report", async () => {
    (getRecurringProblemsReport as jest.Mock).mockResolvedValue({
      definitionVersion: "KPI-V1",
      groups: [],
    });
    const response = await GET(new Request(validUrl));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getRecurringProblemsReport).toHaveBeenCalledWith({
      actorUserId: 7,
      query: {
        from: new Date("2026-08-31T20:30:00.000Z"),
        to: new Date("2026-09-14T20:30:00.000Z"),
        limit: 25,
      },
    });
  });

  it("rejects calendar boundaries that are not Tehran midnight", async () => {
    const response = await GET(new Request(
      "http://localhost/api/v2/reporting/kpis/recurring-problems?from=2026-09-01T01%3A00%3A00%2B03%3A30&to=2026-09-15T00%3A00%3A00%2B03%3A30"
    ));
    expect(response.status).toBe(400);
    expect(getRecurringProblemsReport).not.toHaveBeenCalled();
  });

  it("preserves the stable forbidden response", async () => {
    (getRecurringProblemsReport as jest.Mock).mockRejectedValue(
      new ReportingKpiError("دسترسی مجاز نیست", "FORBIDDEN", 403)
    );
    const response = await GET(new Request(validUrl));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  });
});
