import { GET } from "@/app/api/v2/reporting/access/route";
import { getReportingAccessCapabilities } from "@/modules/reporting/application/reporting-authorization";
import { requireReportingApiV2User } from "@/modules/shared/api-v2-authorization";

jest.mock("@/modules/reporting/application/reporting-authorization", () => ({
  getReportingAccessCapabilities: jest.fn(),
}));
jest.mock("@/modules/shared/api-v2-authorization", () => ({ requireReportingApiV2User: jest.fn() }));

describe("reporting access API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireReportingApiV2User as jest.Mock).mockResolvedValue({ authorized: true, user: { id: 7 } });
  });

  it("returns effective scope and capabilities", async () => {
    (getReportingAccessCapabilities as jest.Mock).mockResolvedValue({
      scope: { type: "TEAMS", accessMode: "MANAGEMENT", teamIds: [3] },
      canExport: false,
      canDrillDown: true,
    });
    const response = await GET(new Request("http://localhost/api/v2/reporting/access"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { scope: { teamIds: [3] }, canExport: false, canDrillDown: true },
    });
  });

  it("fails closed without an explicit reporting grant", async () => {
    (getReportingAccessCapabilities as jest.Mock).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/v2/reporting/access"));
    expect(response.status).toBe(403);
  });
});
