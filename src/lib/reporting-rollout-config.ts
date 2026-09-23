export const REPORTING_ROLLOUT_STAGES = [
  "DISABLED",
  "SHADOW",
  "CANARY",
  "GENERAL",
] as const;

export type ReportingRolloutStage =
  (typeof REPORTING_ROLLOUT_STAGES)[number];

export type ReportingRolloutConfig = {
  stage: ReportingRolloutStage;
  projectionEnabled: boolean;
  apiEnabled: boolean;
  canaryUserIds: ReadonlySet<number>;
};

const STAGE_FLAGS: Record<
  ReportingRolloutStage,
  Pick<ReportingRolloutConfig, "projectionEnabled" | "apiEnabled">
> = {
  DISABLED: { projectionEnabled: false, apiEnabled: false },
  SHADOW: { projectionEnabled: true, apiEnabled: false },
  CANARY: { projectionEnabled: true, apiEnabled: true },
  GENERAL: { projectionEnabled: true, apiEnabled: true },
};

const ENABLED_VALUES = new Set(["1", "true", "on"]);
const DISABLED_VALUES = new Set(["0", "false", "off"]);
const MAXIMUM_CANARY_USERS = 100;

function parseStage(
  configuredValue: string | undefined,
  nodeEnvironment: string | undefined
): ReportingRolloutStage {
  const fallback = nodeEnvironment === "production" ? "DISABLED" : "GENERAL";
  const stage = (configuredValue?.trim().toUpperCase() || fallback) as string;
  if (!REPORTING_ROLLOUT_STAGES.includes(stage as ReportingRolloutStage)) {
    throw new Error(
      `REPORTING_ROLLOUT_STAGE must be one of ${REPORTING_ROLLOUT_STAGES.join(", ")}`
    );
  }
  return stage as ReportingRolloutStage;
}

function parseOptionalBoolean(
  name: string,
  configuredValue: string | undefined
): boolean | undefined {
  const normalized = configuredValue?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (ENABLED_VALUES.has(normalized)) return true;
  if (DISABLED_VALUES.has(normalized)) return false;
  throw new Error(`${name} must be true/false, on/off, or 1/0`);
}

function parseCanaryUserIds(configuredValue: string | undefined): Set<number> {
  const values = configuredValue
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
  if (values.length > MAXIMUM_CANARY_USERS) {
    throw new Error(
      `REPORTING_CANARY_USER_IDS cannot contain more than ${MAXIMUM_CANARY_USERS} users`
    );
  }

  const result = new Set<number>();
  for (const value of values) {
    if (!/^[1-9]\d{0,9}$/.test(value)) {
      throw new Error(
        "REPORTING_CANARY_USER_IDS must contain comma-separated positive integer IDs"
      );
    }
    const userId = Number(value);
    if (!Number.isSafeInteger(userId) || result.has(userId)) {
      throw new Error(
        "REPORTING_CANARY_USER_IDS must contain unique safe integer IDs"
      );
    }
    result.add(userId);
  }
  return result;
}

function assertFlagMatchesStage(
  name: string,
  actual: boolean | undefined,
  expected: boolean,
  stage: ReportingRolloutStage
): void {
  if (actual !== undefined && actual !== expected) {
    throw new Error(
      `${name} must be ${String(expected)} while REPORTING_ROLLOUT_STAGE is ${stage}`
    );
  }
}

export function resolveReportingRolloutConfig(
  environment: Readonly<Record<string, string | undefined>>
): ReportingRolloutConfig {
  const stage = parseStage(
    environment.REPORTING_ROLLOUT_STAGE,
    environment.NODE_ENV
  );
  const flags = STAGE_FLAGS[stage];
  assertFlagMatchesStage(
    "FEATURE_REPORTING_PROJECTION_ENABLED",
    parseOptionalBoolean(
      "FEATURE_REPORTING_PROJECTION_ENABLED",
      environment.FEATURE_REPORTING_PROJECTION_ENABLED
    ),
    flags.projectionEnabled,
    stage
  );
  assertFlagMatchesStage(
    "FEATURE_REPORTING_API_ENABLED",
    parseOptionalBoolean(
      "FEATURE_REPORTING_API_ENABLED",
      environment.FEATURE_REPORTING_API_ENABLED
    ),
    flags.apiEnabled,
    stage
  );

  const canaryUserIds = parseCanaryUserIds(
    environment.REPORTING_CANARY_USER_IDS
  );
  if (stage === "CANARY" && canaryUserIds.size === 0) {
    throw new Error(
      "REPORTING_CANARY_USER_IDS must contain at least one user in CANARY stage"
    );
  }
  if (stage !== "CANARY" && canaryUserIds.size > 0) {
    throw new Error(
      "REPORTING_CANARY_USER_IDS must be empty outside the CANARY stage"
    );
  }

  return { stage, ...flags, canaryUserIds };
}

export function getReportingRolloutConfig(): ReportingRolloutConfig {
  return resolveReportingRolloutConfig(process.env);
}

export function isReportingActorAllowedInRollout(
  actorUserId: number,
  config = getReportingRolloutConfig()
): boolean {
  return config.stage !== "CANARY" || config.canaryUserIds.has(actorUserId);
}
