export type ReportingKpiErrorCode = "FORBIDDEN" | "DEPENDENCY_UNAVAILABLE";

export class ReportingKpiError extends Error {
  constructor(
    message: string,
    readonly code: ReportingKpiErrorCode,
    readonly status: 403 | 503
  ) {
    super(message);
    this.name = "ReportingKpiError";
  }
}

export function isReportingKpiError(error: unknown): error is ReportingKpiError {
  return error instanceof ReportingKpiError;
}
