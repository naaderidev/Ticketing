import { getReportingRolloutConfig } from "@/lib/reporting-rollout-config";

const ENABLED_VALUES = new Set(["1", "true", "on"]);
const DISABLED_VALUES = new Set(["0", "false", "off"]);

function resolveOptInProductionFeatureFlag(
  name: string,
  configuredValue: string | undefined,
  nodeEnvironment: string | undefined
): boolean {
  const normalizedValue = configuredValue?.trim().toLowerCase();

  if (!normalizedValue) return nodeEnvironment !== "production";
  if (ENABLED_VALUES.has(normalizedValue)) return true;
  if (DISABLED_VALUES.has(normalizedValue)) return false;

  throw new Error(`${name} must be true/false, on/off, or 1/0`);
}

function resolveExplicitFeatureFlag(
  name: string,
  configuredValue: string | undefined
): boolean {
  const normalizedValue = configuredValue?.trim().toLowerCase();
  if (!normalizedValue) return false;
  if (ENABLED_VALUES.has(normalizedValue)) return true;
  if (DISABLED_VALUES.has(normalizedValue)) return false;
  throw new Error(`${name} must be true/false, on/off, or 1/0`);
}

export function resolveOrganizationContextFeatureFlag(
  configuredValue: string | undefined,
  nodeEnvironment: string | undefined
): boolean {
  return resolveOptInProductionFeatureFlag(
    "FEATURE_ORGANIZATION_CONTEXT_ENABLED",
    configuredValue,
    nodeEnvironment
  );
}

export function isOrganizationContextEnabled(): boolean {
  return resolveOrganizationContextFeatureFlag(
    process.env.FEATURE_ORGANIZATION_CONTEXT_ENABLED,
    process.env.NODE_ENV
  );
}

export function resolveSupportV2ReadFeatureFlag(
  configuredValue: string | undefined,
  nodeEnvironment: string | undefined
): boolean {
  return resolveOptInProductionFeatureFlag(
    "FEATURE_SUPPORT_V2_READ_ENABLED",
    configuredValue,
    nodeEnvironment
  );
}

export function isSupportV2ReadEnabled(): boolean {
  return resolveSupportV2ReadFeatureFlag(
    process.env.FEATURE_SUPPORT_V2_READ_ENABLED,
    process.env.NODE_ENV
  );
}

export function resolveSupportV2WriteFeatureFlag(
  configuredValue: string | undefined,
  nodeEnvironment: string | undefined
): boolean {
  return resolveOptInProductionFeatureFlag(
    "FEATURE_SUPPORT_V2_WRITE_ENABLED",
    configuredValue,
    nodeEnvironment
  );
}

export function isSupportV2WriteEnabled(): boolean {
  return resolveSupportV2WriteFeatureFlag(
    process.env.FEATURE_SUPPORT_V2_WRITE_ENABLED,
    process.env.NODE_ENV
  );
}

export function resolveAgentWorkspaceV2FeatureFlag(
  configuredValue: string | undefined,
  nodeEnvironment: string | undefined
): boolean {
  return resolveOptInProductionFeatureFlag(
    "FEATURE_AGENT_WORKSPACE_V2_ENABLED",
    configuredValue,
    nodeEnvironment
  );
}

export function isAgentWorkspaceV2Enabled(): boolean {
  return resolveAgentWorkspaceV2FeatureFlag(
    process.env.FEATURE_AGENT_WORKSPACE_V2_ENABLED,
    process.env.NODE_ENV
  );
}

export function resolveSlaEnforcementFeatureFlag(
  configuredValue: string | undefined
): boolean {
  return resolveExplicitFeatureFlag(
    "FEATURE_SLA_ENFORCEMENT_ENABLED",
    configuredValue
  );
}

export function isSlaEnforcementEnabled(): boolean {
  return resolveSlaEnforcementFeatureFlag(
    process.env.FEATURE_SLA_ENFORCEMENT_ENABLED
  );
}

export function resolveOutboxDispatchFeatureFlag(
  configuredValue: string | undefined
): boolean {
  return resolveExplicitFeatureFlag(
    "FEATURE_OUTBOX_DISPATCH_ENABLED",
    configuredValue
  );
}

export function isOutboxDispatchEnabled(): boolean {
  return resolveOutboxDispatchFeatureFlag(
    process.env.FEATURE_OUTBOX_DISPATCH_ENABLED
  );
}

export function resolveReportingProjectionFeatureFlag(
  configuredValue: string | undefined,
  nodeEnvironment: string | undefined
): boolean {
  return resolveOptInProductionFeatureFlag(
    "FEATURE_REPORTING_PROJECTION_ENABLED",
    configuredValue,
    nodeEnvironment
  );
}

export function isReportingProjectionEnabled(): boolean {
  return getReportingRolloutConfig().projectionEnabled;
}

export function resolveReportingApiFeatureFlag(
  configuredValue: string | undefined,
  nodeEnvironment: string | undefined
): boolean {
  return resolveOptInProductionFeatureFlag(
    "FEATURE_REPORTING_API_ENABLED",
    configuredValue,
    nodeEnvironment
  );
}

export function isReportingApiEnabled(): boolean {
  return getReportingRolloutConfig().apiEnabled;
}

export function resolveAutomatedResolutionFeatureFlag(
  configuredValue: string | undefined,
  nodeEnvironment: string | undefined
): boolean {
  return resolveOptInProductionFeatureFlag(
    "FEATURE_AUTOMATED_RESOLUTION_ENABLED",
    configuredValue,
    nodeEnvironment
  );
}

export function isAutomatedResolutionEnabled(): boolean {
  return resolveAutomatedResolutionFeatureFlag(
    process.env.FEATURE_AUTOMATED_RESOLUTION_ENABLED,
    process.env.NODE_ENV
  );
}

export function resolveTransactionVolumeIngestionFeatureFlag(
  configuredValue: string | undefined
): boolean {
  return resolveExplicitFeatureFlag(
    "FEATURE_TRANSACTION_VOLUME_INGESTION_ENABLED",
    configuredValue
  );
}

export function isTransactionVolumeIngestionEnabled(): boolean {
  return resolveTransactionVolumeIngestionFeatureFlag(
    process.env.FEATURE_TRANSACTION_VOLUME_INGESTION_ENABLED
  );
}

export function resolveRecurringProblemDetectionFeatureFlag(
  configuredValue: string | undefined
): boolean {
  return resolveExplicitFeatureFlag(
    "FEATURE_RECURRING_PROBLEM_DETECTION_ENABLED",
    configuredValue
  );
}

export function isRecurringProblemDetectionEnabled(): boolean {
  return resolveRecurringProblemDetectionFeatureFlag(
    process.env.FEATURE_RECURRING_PROBLEM_DETECTION_ENABLED
  );
}

export function resolveBusinessReferenceIntegrationFeatureFlag(
  configuredValue: string | undefined
): boolean {
  return resolveExplicitFeatureFlag(
    "FEATURE_BUSINESS_REFERENCE_INTEGRATIONS_ENABLED",
    configuredValue
  );
}

export function isBusinessReferenceIntegrationEnabled(): boolean {
  if (
    process.env.FEATURE_BUSINESS_REFERENCE_INTEGRATIONS_ENABLED === undefined &&
    process.env.NODE_ENV !== "production"
  ) {
    return true;
  }
  return resolveBusinessReferenceIntegrationFeatureFlag(
    process.env.FEATURE_BUSINESS_REFERENCE_INTEGRATIONS_ENABLED
  );
}

export function resolveCustomerExperienceV2FeatureFlag(
  configuredValue: string | undefined,
  nodeEnvironment: string | undefined
): boolean {
  return resolveOptInProductionFeatureFlag(
    "FEATURE_CUSTOMER_EXPERIENCE_V2_ENABLED",
    configuredValue,
    nodeEnvironment
  );
}

export function isCustomerExperienceV2Enabled(): boolean {
  return resolveCustomerExperienceV2FeatureFlag(
    process.env.FEATURE_CUSTOMER_EXPERIENCE_V2_ENABLED,
    process.env.NODE_ENV
  );
}
