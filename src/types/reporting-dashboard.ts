import type { getAutomatedResolutionReport } from "@/modules/reporting/application/automated-resolution-report-service";
import type { getQualityReport } from "@/modules/reporting/application/quality-report-service";
import type {
  getRecurringProblemDrillDown,
  getRecurringProblemsReport,
} from "@/modules/reporting/application/recurring-problem-service";
import type { getReportingAccessCapabilities } from "@/modules/reporting/application/reporting-authorization";
import type { getTicketPerTransactionReport } from "@/modules/reporting/application/ticket-per-transaction-report-service";
import type { getTimeSlaReport } from "@/modules/reporting/application/time-sla-report-service";

export type ReportingAccessCapabilities = NonNullable<
  Awaited<ReturnType<typeof getReportingAccessCapabilities>>
>;
export type TimeSlaReport = Awaited<ReturnType<typeof getTimeSlaReport>>;
export type QualityReport = Awaited<ReturnType<typeof getQualityReport>>;
export type AutomatedResolutionReport = Awaited<
  ReturnType<typeof getAutomatedResolutionReport>
>;
export type TicketPerTransactionReport = Awaited<
  ReturnType<typeof getTicketPerTransactionReport>
>;
export type RecurringProblemsReport = Awaited<
  ReturnType<typeof getRecurringProblemsReport>
>;
export type RecurringProblemDrillDown = Awaited<
  ReturnType<typeof getRecurringProblemDrillDown>
>;

export type ReportingDateRange = {
  from: string;
  to: string;
};

export type ReportingTransactionFilter = {
  providerCode: string;
  transactionType:
    | "CONTRACT"
    | "INVOICE"
    | "PAYMENT"
    | "SETTLEMENT"
    | "POWER_PLANT"
    | "METER"
    | "SAVING_PROGRAM";
};

export const REPORTING_EXPORT_TYPES = [
  "time-sla",
  "quality",
  "automated-resolution",
  "ticket-per-transaction",
  "recurring-problems",
] as const;

export type ReportingExportType = (typeof REPORTING_EXPORT_TYPES)[number];
