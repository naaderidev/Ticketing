export type KnowledgeErrorCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BUSINESS_RULE_VIOLATION"
  | "IDEMPOTENCY_KEY_REUSED"
  | "DEPENDENCY_UNAVAILABLE";

export class KnowledgeError extends Error {
  constructor(
    message: string,
    readonly code: KnowledgeErrorCode,
    readonly status: 403 | 404 | 409 | 422 | 503
  ) {
    super(message);
    this.name = "KnowledgeError";
  }
}

export function isKnowledgeError(error: unknown): error is KnowledgeError {
  return error instanceof KnowledgeError;
}
