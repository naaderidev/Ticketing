export class IncidentError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "BUSINESS_RULE_VIOLATION"
      | "INVALID_TRANSITION",
    readonly status: number
  ) {
    super(message);
    this.name = "IncidentError";
  }
}

export function isIncidentError(error: unknown): error is IncidentError {
  return error instanceof IncidentError;
}
