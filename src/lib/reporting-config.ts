const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_LEASE_SECONDS = 120;
const DEFAULT_MAX_REBUILD_EVENTS = 100_000;
const DEFAULT_REBUILD_SLEEP_MILLISECONDS = 0;

export type ReportingConfig = {
  maintenanceToken: string;
  batchSize: number;
  leaseSeconds: number;
  maxRebuildEvents: number;
  rebuildSleepMilliseconds: number;
};

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

export function resolveReportingConfig(
  environment: Readonly<Record<string, string | undefined>>
): ReportingConfig {
  const maintenanceToken =
    environment.REPORTING_MAINTENANCE_TOKEN?.trim() ||
    (environment.NODE_ENV === "production"
      ? undefined
      : environment.SLA_MAINTENANCE_TOKEN?.trim() ||
        environment.ATTACHMENT_CLEANUP_TOKEN?.trim());
  if (!maintenanceToken || maintenanceToken.length < 32) {
    throw new Error(
      "REPORTING_MAINTENANCE_TOKEN must contain at least 32 characters"
    );
  }
  return {
    maintenanceToken,
    batchSize: boundedInteger(
      "REPORTING_PROJECTION_BATCH_SIZE",
      environment.REPORTING_PROJECTION_BATCH_SIZE,
      DEFAULT_BATCH_SIZE,
      1,
      500
    ),
    leaseSeconds: boundedInteger(
      "REPORTING_PROJECTION_LEASE_SECONDS",
      environment.REPORTING_PROJECTION_LEASE_SECONDS,
      DEFAULT_LEASE_SECONDS,
      30,
      900
    ),
    maxRebuildEvents: boundedInteger(
      "REPORTING_REBUILD_MAX_EVENTS",
      environment.REPORTING_REBUILD_MAX_EVENTS,
      DEFAULT_MAX_REBUILD_EVENTS,
      1,
      10_000_000
    ),
    rebuildSleepMilliseconds: boundedInteger(
      "REPORTING_REBUILD_SLEEP_MS",
      environment.REPORTING_REBUILD_SLEEP_MS,
      DEFAULT_REBUILD_SLEEP_MILLISECONDS,
      0,
      5_000
    ),
  };
}

export function getReportingConfig(): ReportingConfig {
  return resolveReportingConfig(process.env);
}
