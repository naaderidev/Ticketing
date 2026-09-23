const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_LOCK_SECONDS = 120;
const DEFAULT_MAX_ATTEMPTS = 5;

export type SlaRoutingConfig = {
  maintenanceToken: string;
  batchSize: number;
  lockSeconds: number;
  outboxMaxAttempts: number;
};

function isDemoMode(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(
    value?.trim().toLowerCase() ?? ""
  );
}

function boundedInteger(
  name: string,
  configuredValue: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (!configuredValue?.trim()) return fallback;
  const value = Number(configuredValue);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export function resolveSlaRoutingConfig(
  environment: Readonly<Record<string, string | undefined>>
): SlaRoutingConfig {
  const allowExistingTokenFallback =
    environment.NODE_ENV !== "production" || isDemoMode(environment.DEMO_MODE);
  const maintenanceToken =
    environment.SLA_MAINTENANCE_TOKEN?.trim() ||
    (allowExistingTokenFallback
      ? environment.ATTACHMENT_CLEANUP_TOKEN?.trim()
      : undefined);
  if (!maintenanceToken || maintenanceToken.length < 32) {
    throw new Error("SLA_MAINTENANCE_TOKEN must contain at least 32 characters");
  }
  return {
    maintenanceToken,
    batchSize: boundedInteger(
      "SLA_JOB_BATCH_SIZE",
      environment.SLA_JOB_BATCH_SIZE,
      DEFAULT_BATCH_SIZE,
      1,
      500
    ),
    lockSeconds: boundedInteger(
      "SLA_JOB_LOCK_SECONDS",
      environment.SLA_JOB_LOCK_SECONDS,
      DEFAULT_LOCK_SECONDS,
      30,
      900
    ),
    outboxMaxAttempts: boundedInteger(
      "OUTBOX_MAX_ATTEMPTS",
      environment.OUTBOX_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS,
      1,
      20
    ),
  };
}

export function getSlaRoutingConfig(): SlaRoutingConfig {
  return resolveSlaRoutingConfig(process.env);
}
