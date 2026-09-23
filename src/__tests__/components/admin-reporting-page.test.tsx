import { notFound, redirect } from "next/navigation";
import AdminReportingPage from "@/app/admin/reporting/page";
import { ReportingDashboard } from "@/components/reporting/reporting-dashboard";
import { getCurrentUser } from "@/lib/current-user";
import { isReportingApiEnabled } from "@/lib/feature-flags";
import { getReportingAccessCapabilities } from "@/modules/reporting/application/reporting-authorization";

jest.mock("next/server", () => ({ connection: jest.fn().mockResolvedValue(undefined) }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  notFound: jest.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
jest.mock("@/lib/current-user", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/feature-flags", () => ({ isReportingApiEnabled: jest.fn() }));
jest.mock("@/modules/reporting/application/reporting-authorization", () => ({
  getReportingAccessCapabilities: jest.fn(),
}));

describe("AdminReportingPage authorization", () => {
  beforeEach(() => {
    (isReportingApiEnabled as jest.Mock).mockReturnValue(true);
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: 7, role: "ADMIN" });
    (getReportingAccessCapabilities as jest.Mock).mockResolvedValue({
      scope: { type: "GLOBAL", accessMode: "MANAGEMENT", teamIds: null },
      canExport: false,
      canDrillDown: false,
      reports: {
        timeSla: true,
        quality: true,
        automatedResolution: true,
        ticketPerTransaction: true,
        recurringProblems: true,
      },
    });
  });

  it("returns a dashboard only for an explicitly authorized administrator", async () => {
    const page = await AdminReportingPage();

    expect(page.type).toBe(ReportingDashboard);
    expect(page.props.access.scope.type).toBe("GLOBAL");
  });

  it("fails closed when the reporting grant is missing", async () => {
    (getReportingAccessCapabilities as jest.Mock).mockResolvedValue(null);

    await expect(AdminReportingPage()).rejects.toThrow("REDIRECT:/forbidden");
    expect(redirect).toHaveBeenCalledWith("/forbidden");
  });

  it("does not expose the route while the reporting feature is disabled", async () => {
    (isReportingApiEnabled as jest.Mock).mockReturnValue(false);

    await expect(AdminReportingPage()).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(getReportingAccessCapabilities).not.toHaveBeenCalled();
  });
});
