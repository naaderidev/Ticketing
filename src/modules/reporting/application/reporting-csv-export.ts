export const REPORTING_EXPORT_TYPES = [
  "time-sla",
  "quality",
  "automated-resolution",
  "ticket-per-transaction",
  "recurring-problems",
] as const;

export type ReportingExportType = (typeof REPORTING_EXPORT_TYPES)[number];

export function isReportingExportType(value: string): value is ReportingExportType {
  return REPORTING_EXPORT_TYPES.includes(value as ReportingExportType);
}

type CsvScalar = string | number | boolean | null;

function collectLeafRows(
  value: unknown,
  path: string,
  rows: Array<{ path: string; value: CsvScalar }>
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    rows.push({ path, value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectLeafRows(item, `${path}.${index}`, rows));
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      collectLeafRows(item, path ? `${path}.${key}` : key, rows);
    }
    return;
  }
  throw new TypeError(`Unsupported reporting export value at ${path}`);
}

function csvCell(value: CsvScalar): string {
  const rendered = value === null ? "" : String(value);
  const formulaSafe = /^[\t\r ]*[=+\-@]/.test(rendered)
    ? `'${rendered}`
    : rendered;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}

export function serializeAggregateReportCsv(report: unknown): string {
  const rows: Array<{ path: string; value: CsvScalar }> = [];
  collectLeafRows(report, "", rows);
  const body = rows
    .map((row) => `${csvCell(row.path)},${csvCell(row.value)}`)
    .join("\r\n");
  return `\uFEFF"path","value"\r\n${body}\r\n`;
}
