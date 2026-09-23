import { serializeAggregateReportCsv } from "@/modules/reporting/application/reporting-csv-export";

describe("reporting CSV export", () => {
  it("flattens only aggregate leaves into a stable UTF-8 CSV", () => {
    const csv = serializeAggregateReportCsv({
      definitionVersion: "KPI-V1",
      metric: { percentage: 42.5, reason: null },
      rows: [{ code: "ACCOUNT" }],
    });
    expect(csv.startsWith('\uFEFF"path","value"')).toBe(true);
    expect(csv).toContain('"metric.percentage","42.5"');
    expect(csv).toContain('"rows.0.code","ACCOUNT"');
  });

  it("neutralizes spreadsheet formula prefixes", () => {
    const csv = serializeAggregateReportCsv({ label: "=HYPERLINK(\"bad\")" });
    expect(csv).toContain('"label","\'=HYPERLINK(""bad"")"');
  });
});
