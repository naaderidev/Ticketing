export type DomainErrorKind = "VALIDATION" | "NOT_FOUND" | "CONFLICT";

export class DomainError extends Error {
  readonly kind: DomainErrorKind;

  constructor(kind: DomainErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DomainError";
    this.kind = kind;
  }
}

export function validationError(message: string) {
  return new DomainError("VALIDATION", message);
}

export function notFoundError(message: string) {
  return new DomainError("NOT_FOUND", message);
}

export function conflictError(message: string, cause?: unknown) {
  return new DomainError("CONFLICT", message, { cause });
}

type PersistenceErrorMessages = {
  unique?: string;
  notFound?: string;
  foreignKey?: string;
  foreignKeyNotFound?: string;
};

export function getPersistenceErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

export function rethrowPersistenceError(
  error: unknown,
  messages: PersistenceErrorMessages
): never {
  const code = getPersistenceErrorCode(error);
  if (code === "P2002" && messages.unique) {
    throw conflictError(messages.unique, error);
  }
  if (code === "P2025" && messages.notFound) {
    throw new DomainError("NOT_FOUND", messages.notFound, { cause: error });
  }
  if (code === "P2003" && messages.foreignKeyNotFound) {
    throw new DomainError("NOT_FOUND", messages.foreignKeyNotFound, { cause: error });
  }
  if (code === "P2003" && messages.foreignKey) {
    throw conflictError(messages.foreignKey, error);
  }
  throw error;
}
