import {
  buildReportingSearchParams,
  createDefaultReportingRange,
  formatReportingRange,
  reportingBoundary,
  shiftJalaliDate,
} from "@/modules/reporting/presentation/reporting-dashboard-range";

describe("reporting dashboard range", () => {
  it("creates a range of completed Tehran calendar days", () => {
    const range = createDefaultReportingRange(
      new Date("2026-09-15T08:00:00.000Z"),
      7
    );

    expect(range).toEqual({ from: "1405/06/17", to: "1405/06/23" });
  });

  it("serializes the inclusive UI end date as an exclusive API boundary", () => {
    const params = buildReportingSearchParams(
      { from: "1405/06/10", to: "1405/06/23" },
      { providerCode: "DEMO_PROVIDER", transactionType: "PAYMENT" }
    );

    expect(params.get("from")).toBe("1405/06/10 00:00:00");
    expect(params.get("to")).toBe("1405/06/24 00:00:00");
    expect(params.get("providerCode")).toBe("DEMO_PROVIDER");
    expect(params.get("transactionType")).toBe("PAYMENT");
  });

  it("handles calendar shifts across month boundaries", () => {
    expect(shiftJalaliDate("1405/07/01", -1)).toBe("1405/06/31");
    expect(reportingBoundary("1405/06/10")).toBe(
      "1405/06/10 00:00:00"
    );
    expect(formatReportingRange({ from: "1405/06/10", to: "1405/06/11" })).toContain("تا");
  });

  it("rejects reversed ranges", () => {
    expect(() =>
      buildReportingSearchParams({ from: "1405/06/24", to: "1405/06/10" })
    ).toThrow("Reporting start date cannot be after end date");
  });
});
