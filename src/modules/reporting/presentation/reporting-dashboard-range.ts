import type {
  ReportingDateRange,
  ReportingTransactionFilter,
} from "@/types/reporting-dashboard";
import {
  formatJalaliDate,
  shiftJalaliDate,
  toPersianDateDigits,
} from "@/lib/jalali-date";

export { shiftJalaliDate };

export function createDefaultReportingRange(
  now = new Date(),
  completedDays = 30
): ReportingDateRange {
  const today = formatJalaliDate(now);
  const to = shiftJalaliDate(today, -1);
  return { from: shiftJalaliDate(to, -(completedDays - 1)), to };
}

export function reportingBoundary(jalaliDate: string): string {
  return `${jalaliDate} 00:00:00`;
}

export function buildReportingSearchParams(
  range: ReportingDateRange,
  transaction?: ReportingTransactionFilter,
  limit = 50
): URLSearchParams {
  if (range.from > range.to) {
    throw new Error("Reporting start date cannot be after end date");
  }
  const params = new URLSearchParams({
    from: reportingBoundary(range.from),
    to: reportingBoundary(shiftJalaliDate(range.to, 1)),
  });
  if (transaction) {
    params.set("providerCode", transaction.providerCode);
    params.set("transactionType", transaction.transactionType);
  }
  if (limit !== 50) params.set("limit", String(limit));
  return params;
}

export function formatReportingRange(range: ReportingDateRange): string {
  return `${toPersianDateDigits(range.from)} تا ${toPersianDateDigits(range.to)}`;
}
