import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReportingDashboard } from "@/components/reporting/reporting-dashboard";
import {
  useAutomatedResolutionReport,
  useQualityReport,
  useRecurringProblemDrillDown,
  useRecurringProblemsReport,
  useReportingExport,
  useTicketPerTransactionReport,
  useTimeSlaReport,
} from "@/hooks";
import type { ReportingAccessCapabilities } from "@/types/reporting-dashboard";

jest.mock("@/hooks", () => ({
  useAutomatedResolutionReport: jest.fn(),
  useQualityReport: jest.fn(),
  useRecurringProblemDrillDown: jest.fn(),
  useRecurringProblemsReport: jest.fn(),
  useReportingExport: jest.fn(),
  useTicketPerTransactionReport: jest.fn(),
  useTimeSlaReport: jest.fn(),
}));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

const freshness = {
  status: "FRESH",
  projectionLagSeconds: 12,
  lastProjectedEventAt: "2026-09-14T12:00:00.000Z",
};
const query = (data: unknown, enabled = true) => ({
  data,
  error: null,
  isLoading: false,
  isFetching: false,
  isEnabled: enabled,
  refetch: jest.fn().mockResolvedValue({ data }),
});

const globalAccess = {
  scope: { type: "GLOBAL", accessMode: "MANAGEMENT", teamIds: null },
  canExport: true,
  canDrillDown: true,
  reports: {
    timeSla: true,
    quality: true,
    automatedResolution: true,
    ticketPerTransaction: true,
    recurringProblems: true,
  },
} as ReportingAccessCapabilities;

describe("ReportingDashboard", () => {
  beforeEach(() => {
    (useTimeSlaReport as jest.Mock).mockReturnValue(query({
      definitionVersion: "KPI-V1",
      freshness,
      dataQuality: { eligibleCount: 10, excludedCount: 1, missingEventCount: 0, missingDimensionCount: 1, legacyCount: 0 },
      firstResponseTime: { value: { averageMilliseconds: 1_800_000, medianMilliseconds: 1_200_000, p90Milliseconds: 3_600_000 }, reason: null, sampleCount: 8 },
      resolutionTime: { value: { averageMilliseconds: 7_200_000, medianMilliseconds: 5_400_000, p90Milliseconds: 10_800_000 }, reason: null, sampleCount: 7 },
      slaCompliance: {
        firstResponse: { percentage: 90, sampleCount: 10 },
        resolution: { percentage: 80, sampleCount: 10 },
        combined: { percentage: 70, reason: null, sampleCount: 10, metCount: 7, breachedCount: 3 },
      },
    }));
    (useQualityReport as jest.Mock).mockReturnValue(query({
      freshness,
      dataQuality: { eligibleCount: 8, excludedCount: 2, missingEventCount: 1, missingDimensionCount: 0, legacyCount: 1 },
      firstContactResolution: { percentage: 75, reason: null, sampleCount: 8, achievedCount: 6 },
      reopenRate: { percentage: 12.5, reason: null, reopenedTicketCount: 1 },
      customerSatisfaction: { score: 4.2, reason: null, ratingCount: 40, participationPercentage: 50, distribution: [{ rating: 5, count: 20, percentage: 50 }] },
    }));
    (useAutomatedResolutionReport as jest.Mock).mockReturnValue(query({
      freshness,
      dataQuality: { eligibleCount: 20, excludedCount: 2, missingEventCount: 0, missingDimensionCount: 0, legacyCount: 0 },
      automatedResolution: { percentage: 30, reason: null, confirmedAutomatedCount: 6, sampleCount: 20, convertedToTicketCount: 8, humanInterventionCount: 3, unknownOutcomeCount: 3 },
    }));
    (useTicketPerTransactionReport as jest.Mock).mockReturnValue(query({
      freshness,
      dataQuality: { expectedBucketCount: 30, verifiedBucketCount: 30, missingBucketCount: 0 },
      ticketPerTransaction: { value: 2, reason: null, verifiedUniqueTicketCount: 20, successfulTransactionCount: "10000" },
    }));
    (useRecurringProblemsReport as jest.Mock).mockReturnValue(query({
      freshness,
      dataQuality: { eligibleCount: 12, excludedCount: 1, missingDimensionCount: 0, legacyCount: 0 },
      recurringRate: { percentage: 25, reason: null, recurringTicketCount: 3 },
      ranking: [{ serviceCode: "IDENTITY", requestTypeCode: "LOGIN", serviceName: "حساب کاربری", requestTypeName: "ورود", count: 4, sharePercentage: 33.33 }],
      groups: [],
    }));
    (useRecurringProblemDrillDown as jest.Mock).mockReturnValue(query({ tickets: [] }, false));
    (useReportingExport as jest.Mock).mockReturnValue({ isPending: false, mutateAsync: jest.fn().mockResolvedValue(undefined) });
  });

  it("shows all nine KPI cards and the effective global scope", () => {
    render(<ReportingDashboard access={globalAccess} />);

    expect(screen.getByText("نمای مدیریتی سراسری")).toBeInTheDocument();
    [
      "زمان اولین پاسخ",
      "زمان حل کامل",
      "حل در اولین ارتباط",
      "رعایت زمان تعهد",
      "بازشدن دوباره",
      "رضایت کاربر",
      "حل خودکار",
      "تیکت به ازای تراکنش",
      "مشکلات پرتکرار",
    ].forEach((title) => expect(screen.getByRole("heading", { name: title })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "خروجی CSV" })).toBeInTheDocument();
    expect(useRecurringProblemDrillDown).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) })
    );
  });

  it("keeps transaction KPI unavailable and export hidden for a team-only reader", () => {
    const teamAccess = {
      ...globalAccess,
      scope: { type: "TEAMS", accessMode: "MANAGEMENT", teamIds: [3, 5] },
      canExport: false,
      reports: { ...globalAccess.reports, ticketPerTransaction: false },
    } as ReportingAccessCapabilities;

    render(<ReportingDashboard access={teamAccess} />);

    expect(screen.getByText("نمای ۲ تیم مجاز")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "خروجی CSV" })).not.toBeInTheDocument();
    expect(screen.getByText("این شاخص فقط در Scope سراسری منتشر می‌شود")).toBeInTheDocument();
    expect(useTicketPerTransactionReport).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      false
    );
  });

  it("validates the provider code before applying filters", () => {
    render(<ReportingDashboard access={globalAccess} />);

    fireEvent.change(screen.getByLabelText("کد منبع تراکنش"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "اعمال فیلتر" }));

    expect(screen.getByRole("alert")).toHaveTextContent("کد منبع تراکنش");
  });
});
