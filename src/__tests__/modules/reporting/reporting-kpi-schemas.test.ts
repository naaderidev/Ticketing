import { recurringProblemsReportQuerySchema, timeSlaReportQuerySchema } from "@/modules/reporting/contracts/reporting-kpi-schemas";

describe("time and SLA report query", () => {
  it("parses an explicit ISO offset into a half-open UTC range", () => {
    const result = timeSlaReportQuerySchema.parse({
      from: "2026-09-01T00:00:00+03:30",
      to: "2026-10-01T00:00:00+03:30",
    });
    expect(result.from.toISOString()).toBe("2026-08-31T20:30:00.000Z");
    expect(result.to.toISOString()).toBe("2026-09-30T20:30:00.000Z");
  });

  it("parses Persian Jalali boundaries into a half-open UTC range", () => {
    const result = timeSlaReportQuerySchema.parse({
      from: "۱۴۰۵/۰۶/۱۰ ۰۰:۰۰:۰۰",
      to: "۱۴۰۵/۰۷/۰۹ ۰۰:۰۰:۰۰",
    });
    expect(result.from.toISOString()).toBe("2026-08-31T20:30:00.000Z");
    expect(result.to.toISOString()).toBe("2026-09-30T20:30:00.000Z");
  });

  it("rejects reversed, overlong and ambiguous timestamp ranges", () => {
    expect(
      timeSlaReportQuerySchema.safeParse({
        from: "2026-09-02T00:00:00Z",
        to: "2026-09-01T00:00:00Z",
      }).success
    ).toBe(false);
    expect(
      timeSlaReportQuerySchema.safeParse({
        from: "2025-01-01T00:00:00Z",
        to: "2026-01-03T00:00:00Z",
      }).success
    ).toBe(false);
    expect(
      timeSlaReportQuerySchema.safeParse({
        from: "2026-09-01",
        to: "2026-09-02",
      }).success
    ).toBe(false);
  });
});

describe("recurring problems report query", () => {
  it("accepts half-open Tehran calendar-day boundaries and applies the safe limit", () => {
    const result = recurringProblemsReportQuerySchema.parse({
      from: "2026-09-01T00:00:00+03:30",
      to: "2026-09-15T00:00:00+03:30",
    });
    expect(result).toEqual({
      from: new Date("2026-08-31T20:30:00.000Z"),
      to: new Date("2026-09-14T20:30:00.000Z"),
      limit: 50,
    });
  });

  it("rejects non-midnight and oversized result limits", () => {
    expect(recurringProblemsReportQuerySchema.safeParse({
      from: "2026-09-01T01:00:00+03:30",
      to: "2026-09-15T00:00:00+03:30",
    }).success).toBe(false);
    expect(recurringProblemsReportQuerySchema.safeParse({
      from: "2026-09-01T00:00:00+03:30",
      to: "2026-09-15T00:00:00+03:30",
      limit: 101,
    }).success).toBe(false);
  });
});
