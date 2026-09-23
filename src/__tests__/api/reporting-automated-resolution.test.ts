import { GET } from "@/app/api/v2/reporting/kpis/automated-resolution/route";
import { getAutomatedResolutionReport } from "@/modules/reporting/application/automated-resolution-report-service";
import { requireReportingApiV2User } from "@/modules/shared/api-v2-authorization";

jest.mock("@/modules/reporting/application/automated-resolution-report-service", () => ({
  getAutomatedResolutionReport: jest.fn(),
}));
jest.mock("@/modules/shared/api-v2-authorization", () => ({
  requireReportingApiV2User: jest.fn(),
}));

const url = "http://localhost/api/v2/reporting/kpis/automated-resolution?from=2026-09-01T00%3A00%3A00Z&to=2026-10-01T00%3A00%3A00Z";

describe("automated resolution reporting API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireReportingApiV2User as jest.Mock).mockResolvedValue({ authorized: true, user: { id: 7 } });
  });

  it("returns the private versioned aggregate", async () => {
    (getAutomatedResolutionReport as jest.Mock).mockResolvedValue({ definitionVersion: "KPI-V1" });
    const response = await GET(new Request(url));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getAutomatedResolutionReport).toHaveBeenCalledWith({
      actorUserId: 7,
      range: {
        from: new Date("2026-09-01T00:00:00.000Z"),
        to: new Date("2026-10-01T00:00:00.000Z"),
      },
    });
  });
});
