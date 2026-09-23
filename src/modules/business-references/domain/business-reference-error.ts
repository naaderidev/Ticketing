export type BusinessReferenceErrorCode =
  | "BUSINESS_RULE_VIOLATION"
  | "DEPENDENCY_UNAVAILABLE"
  | "UPSTREAM_INVALID_RESPONSE";

export class BusinessReferenceError extends Error {
  constructor(
    message: string,
    readonly code: BusinessReferenceErrorCode,
    readonly status: 404 | 422 | 502 | 503
  ) {
    super(message);
    this.name = "BusinessReferenceError";
  }
}

export function isBusinessReferenceError(
  error: unknown
): error is BusinessReferenceError {
  return error instanceof BusinessReferenceError;
}
