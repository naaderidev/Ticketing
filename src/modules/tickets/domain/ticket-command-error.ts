export type TicketCommandErrorCode =
  | "BUSINESS_RULE_VIOLATION"
  | "CONCURRENT_MODIFICATION"
  | "DEPENDENCY_UNAVAILABLE"
  | "UPSTREAM_INVALID_RESPONSE"
  | "IDEMPOTENCY_IN_PROGRESS"
  | "IDEMPOTENCY_KEY_REUSED"
  | "INVALID_CURSOR"
  | "INVALID_TRANSITION"
  | "PRECONDITION_REQUIRED"
  | "ACTIVE_INCIDENT";

export class TicketCommandError extends Error {
  constructor(
    message: string,
    readonly code: TicketCommandErrorCode,
    readonly status: 409 | 422 | 428 | 502 | 503
  ) {
    super(message);
    this.name = "TicketCommandError";
  }
}

export function isTicketCommandError(
  error: unknown
): error is TicketCommandError {
  return error instanceof TicketCommandError;
}
