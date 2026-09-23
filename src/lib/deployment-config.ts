import {
  getAttachmentCleanupToken,
  getAttachmentConfig,
} from "@/lib/attachment-config";
import {
  getApplicationOrigin,
  getJwtSecret,
  getSecurityHashSecret,
  getTrustedProxyIpHeader,
} from "@/lib/security-config";
import { getMetricsToken } from "@/lib/observability-config";
import { getSlaRoutingConfig } from "@/lib/sla-routing-config";
import { getReportingConfig } from "@/lib/reporting-config";
import { getReportingRolloutConfig } from "@/lib/reporting-rollout-config";
import { getBusinessReferenceIntegrationConfig } from "@/lib/business-reference-integration-config";
import {
  isAgentWorkspaceV2Enabled,
  isBusinessReferenceIntegrationEnabled,
  isCustomerExperienceV2Enabled,
  isOutboxDispatchEnabled,
  isReportingApiEnabled,
  isReportingProjectionEnabled,
  isOrganizationContextEnabled,
  isSlaEnforcementEnabled,
  isSupportV2ReadEnabled,
  isSupportV2WriteEnabled,
} from "@/lib/feature-flags";
import { isDemoMode } from "@/lib/demo-mode";

const DEPLOYMENT_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function resolveDeploymentVersion(
  configuredVersion: string | undefined,
  nodeEnvironment: string | undefined
): string {
  const version = configuredVersion?.trim();

  if (!version) {
    if (nodeEnvironment === "production") {
      throw new Error("DEPLOYMENT_VERSION must be configured in production");
    }
    return "development";
  }

  if (!DEPLOYMENT_VERSION_PATTERN.test(version)) {
    throw new Error(
      "DEPLOYMENT_VERSION must be 1-64 URL-safe alphanumeric characters"
    );
  }

  return version;
}

export function getDeploymentVersion(): string {
  return resolveDeploymentVersion(
    process.env.DEPLOYMENT_VERSION,
    process.env.NODE_ENV
  );
}

export function assertRuntimeConfiguration(requestUrl: string): void {
  getJwtSecret();
  getSecurityHashSecret();

  if (!getApplicationOrigin(requestUrl)) {
    throw new Error("APP_ORIGIN must be a valid production origin");
  }

  getTrustedProxyIpHeader();
  getAttachmentConfig();
  getAttachmentCleanupToken();
  getMetricsToken();
  getDeploymentVersion();
  getSlaRoutingConfig();
  getReportingConfig();
  getReportingRolloutConfig();
  isOrganizationContextEnabled();
  isSupportV2ReadEnabled();
  isSupportV2WriteEnabled();
  isAgentWorkspaceV2Enabled();
  isSlaEnforcementEnabled();
  isOutboxDispatchEnabled();
  isReportingProjectionEnabled();
  isReportingApiEnabled();
  isCustomerExperienceV2Enabled();
  if (isBusinessReferenceIntegrationEnabled() && !isDemoMode()) {
    getBusinessReferenceIntegrationConfig();
  }
}
