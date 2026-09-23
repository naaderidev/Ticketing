import { getDeploymentVersion } from "@/lib/deployment-config";

type LogLevel = "error" | "warn";
type SafeContextValue = string | number | boolean | null | undefined;
const SENSITIVE_CONTEXT_KEY_PATTERN =
  /(authorization|cookie|password|secret|token|email|mobile|national|message|fileName|ipAddress)/i;

export interface OperationalLogContext {
  [key: string]: SafeContextValue;
}

interface OperationalLogInput {
  level: LogLevel;
  event: string;
  error?: unknown;
  context?: OperationalLogContext;
  timestamp?: Date;
  deploymentVersion?: string;
}

export interface OperationalLogEntry extends OperationalLogContext {
  timestamp: string;
  level: LogLevel;
  event: string;
  service: "ticketing-system";
  deploymentVersion: string;
  errorType?: string;
  errorDigest?: string;
}

function errorDigest(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("digest" in error)) {
    return undefined;
  }
  const digest = String(error.digest);
  return /^[A-Za-z0-9._-]{1,128}$/.test(digest) ? digest : undefined;
}

function safeDeploymentVersion(): string {
  try {
    return getDeploymentVersion();
  } catch {
    return "invalid";
  }
}

function sanitizeContext(
  context: OperationalLogContext | undefined
): OperationalLogContext {
  if (!context) return {};
  return Object.fromEntries(
    Object.entries(context).filter(
      ([key]) => !SENSITIVE_CONTEXT_KEY_PATTERN.test(key)
    )
  );
}

export function createOperationalLogEntry(
  input: OperationalLogInput
): OperationalLogEntry {
  const rawErrorType =
    input.error === undefined
      ? undefined
      : input.error instanceof Error
        ? input.error.name
        : "UnknownError";
  const errorType =
    rawErrorType && /^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(rawErrorType)
      ? rawErrorType
      : "UnknownError";
  const digest = errorDigest(input.error);

  return {
    ...sanitizeContext(input.context),
    timestamp: (input.timestamp ?? new Date()).toISOString(),
    level: input.level,
    event: input.event,
    service: "ticketing-system",
    deploymentVersion: input.deploymentVersion ?? safeDeploymentVersion(),
    ...(input.error !== undefined ? { errorType } : {}),
    ...(digest ? { errorDigest: digest } : {}),
  };
}

export function logOperationalError(
  event: string,
  error: unknown,
  context?: OperationalLogContext
): void {
  console.error(
    JSON.stringify(
      createOperationalLogEntry({ level: "error", event, error, context })
    )
  );
}

export function logOperationalWarning(
  event: string,
  context?: OperationalLogContext
): void {
  console.warn(
    JSON.stringify(createOperationalLogEntry({ level: "warn", event, context }))
  );
}
