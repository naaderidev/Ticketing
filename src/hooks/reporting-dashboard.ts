"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  buildReportingSearchParams,
} from "@/modules/reporting/presentation/reporting-dashboard-range";
import type {
  AutomatedResolutionReport,
  QualityReport,
  RecurringProblemDrillDown,
  RecurringProblemsReport,
  ReportingDateRange,
  ReportingExportType,
  ReportingTransactionFilter,
  TicketPerTransactionReport,
  TimeSlaReport,
} from "@/types/reporting-dashboard";

type ApiSuccess<T> = { data: T };
type ApiFailure = {
  error?: { code?: string; message?: string; requestId?: string };
};

export class ReportingApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId: string | null
  ) {
    super(message);
    this.name = "ReportingApiError";
  }
}

async function readApiError(response: Response): Promise<ReportingApiError> {
  let body: ApiFailure = {};
  try {
    body = (await response.json()) as ApiFailure;
  } catch {
    // Non-JSON failures still carry a status and may carry a request id.
  }
  return new ReportingApiError(
    body.error?.message ?? "دریافت گزارش ناموفق بود",
    response.status,
    body.error?.code ?? "UNKNOWN_ERROR",
    body.error?.requestId ?? response.headers.get("x-request-id")
  );
}

async function requestReport<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw await readApiError(response);
  const body = (await response.json()) as ApiSuccess<T>;
  return body.data;
}

function reportPath(
  reportType: ReportingExportType,
  range: ReportingDateRange,
  transaction?: ReportingTransactionFilter
): string {
  const params = buildReportingSearchParams(
    range,
    reportType === "ticket-per-transaction" ? transaction : undefined
  );
  return `/api/v2/reporting/kpis/${reportType}?${params}`;
}

export function useTimeSlaReport(range: ReportingDateRange) {
  return useQuery<TimeSlaReport, ReportingApiError>({
    queryKey: ["reporting", "time-sla", range],
    queryFn: () => requestReport(reportPath("time-sla", range)),
    retry: false,
  });
}

export function useQualityReport(range: ReportingDateRange) {
  return useQuery<QualityReport, ReportingApiError>({
    queryKey: ["reporting", "quality", range],
    queryFn: () => requestReport(reportPath("quality", range)),
    retry: false,
  });
}

export function useAutomatedResolutionReport(range: ReportingDateRange) {
  return useQuery<AutomatedResolutionReport, ReportingApiError>({
    queryKey: ["reporting", "automated-resolution", range],
    queryFn: () =>
      requestReport(reportPath("automated-resolution", range)),
    retry: false,
  });
}

export function useRecurringProblemsReport(range: ReportingDateRange) {
  return useQuery<RecurringProblemsReport, ReportingApiError>({
    queryKey: ["reporting", "recurring-problems", range],
    queryFn: () => requestReport(reportPath("recurring-problems", range)),
    retry: false,
  });
}

export function useTicketPerTransactionReport(
  range: ReportingDateRange,
  transaction: ReportingTransactionFilter,
  enabled: boolean
) {
  return useQuery<TicketPerTransactionReport, ReportingApiError>({
    queryKey: ["reporting", "ticket-per-transaction", range, transaction],
    enabled: enabled && transaction.providerCode.length >= 2,
    queryFn: () =>
      requestReport(reportPath("ticket-per-transaction", range, transaction)),
    retry: false,
  });
}

export function useRecurringProblemDrillDown(
  signalKey: string | null,
  range: ReportingDateRange
) {
  return useQuery<RecurringProblemDrillDown, ReportingApiError>({
    queryKey: ["reporting", "recurring-problem-tickets", signalKey, range],
    enabled: Boolean(signalKey),
    queryFn: () => {
      const params = buildReportingSearchParams(range);
      return requestReport(
        `/api/v2/reporting/kpis/recurring-problems/${encodeURIComponent(signalKey!)}/tickets?${params}`
      );
    },
    retry: false,
  });
}

async function downloadExport(input: {
  reportType: ReportingExportType;
  range: ReportingDateRange;
  transaction: ReportingTransactionFilter;
}) {
  const params = buildReportingSearchParams(
    input.range,
    input.reportType === "ticket-per-transaction"
      ? input.transaction
      : undefined
  );
  const response = await fetch(
    `/api/v2/reporting/exports/${input.reportType}?${params}`,
    { cache: "no-store" }
  );
  if (!response.ok) throw await readApiError(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kpi-${input.reportType}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function useReportingExport() {
  return useMutation<void, ReportingApiError, {
    reportType: ReportingExportType;
    range: ReportingDateRange;
    transaction: ReportingTransactionFilter;
  }>({ mutationFn: downloadExport });
}
