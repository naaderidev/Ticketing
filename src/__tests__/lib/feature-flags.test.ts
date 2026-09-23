import {
  resolveAgentWorkspaceV2FeatureFlag,
  resolveAutomatedResolutionFeatureFlag,
  resolveBusinessReferenceIntegrationFeatureFlag,
  resolveCustomerExperienceV2FeatureFlag,
  resolveOrganizationContextFeatureFlag,
  resolveOutboxDispatchFeatureFlag,
  resolveReportingApiFeatureFlag,
  resolveReportingProjectionFeatureFlag,
  resolveRecurringProblemDetectionFeatureFlag,
  resolveSlaEnforcementFeatureFlag,
  resolveSupportV2ReadFeatureFlag,
  resolveSupportV2WriteFeatureFlag,
  resolveTransactionVolumeIngestionFeatureFlag,
} from "@/lib/feature-flags";

describe("organization context feature flag", () => {
  it("is enabled by default outside production for migration rehearsal", () => {
    expect(resolveOrganizationContextFeatureFlag(undefined, "development")).toBe(
      true
    );
    expect(resolveOrganizationContextFeatureFlag(undefined, "test")).toBe(true);
  });

  it("fails closed by default in production", () => {
    expect(resolveOrganizationContextFeatureFlag(undefined, "production")).toBe(
      false
    );
  });

  it.each([
    ["true", true],
    ["1", true],
    ["ON", true],
    ["false", false],
    ["0", false],
    ["off", false],
  ])("parses %s explicitly", (configured, expected) => {
    expect(resolveOrganizationContextFeatureFlag(configured, "production")).toBe(
      expected
    );
  });

  it("rejects ambiguous values", () => {
    expect(() =>
      resolveOrganizationContextFeatureFlag("enabled", "production")
    ).toThrow("FEATURE_ORGANIZATION_CONTEXT_ENABLED");
  });
});

describe.each([
  ["support catalog read", resolveSupportV2ReadFeatureFlag, "FEATURE_SUPPORT_V2_READ_ENABLED"],
  ["support ticket write", resolveSupportV2WriteFeatureFlag, "FEATURE_SUPPORT_V2_WRITE_ENABLED"],
  ["agent workspace", resolveAgentWorkspaceV2FeatureFlag, "FEATURE_AGENT_WORKSPACE_V2_ENABLED"],
  ["automated resolution", resolveAutomatedResolutionFeatureFlag, "FEATURE_AUTOMATED_RESOLUTION_ENABLED"],
  ["customer experience", resolveCustomerExperienceV2FeatureFlag, "FEATURE_CUSTOMER_EXPERIENCE_V2_ENABLED"],
  ["reporting projection", resolveReportingProjectionFeatureFlag, "FEATURE_REPORTING_PROJECTION_ENABLED"],
  ["reporting API", resolveReportingApiFeatureFlag, "FEATURE_REPORTING_API_ENABLED"],
] as const)("%s feature flag", (_name, resolveFlag, environmentName) => {
  it("is enabled for local rehearsal and disabled by default in production", () => {
    expect(resolveFlag(undefined, "development")).toBe(true);
    expect(resolveFlag(undefined, "test")).toBe(true);
    expect(resolveFlag(undefined, "production")).toBe(false);
  });

  it("honors explicit values and rejects ambiguous configuration", () => {
    expect(resolveFlag("true", "production")).toBe(true);
    expect(resolveFlag("OFF", "development")).toBe(false);
    expect(() => resolveFlag("enabled", "production")).toThrow(environmentName);
  });
});

describe.each([
  ["SLA enforcement", resolveSlaEnforcementFeatureFlag, "FEATURE_SLA_ENFORCEMENT_ENABLED"],
  ["outbox dispatch", resolveOutboxDispatchFeatureFlag, "FEATURE_OUTBOX_DISPATCH_ENABLED"],
  [
    "business reference integrations",
    resolveBusinessReferenceIntegrationFeatureFlag,
    "FEATURE_BUSINESS_REFERENCE_INTEGRATIONS_ENABLED",
  ],
  [
    "transaction volume ingestion",
    resolveTransactionVolumeIngestionFeatureFlag,
    "FEATURE_TRANSACTION_VOLUME_INGESTION_ENABLED",
  ],
  [
    "recurring problem detection",
    resolveRecurringProblemDetectionFeatureFlag,
    "FEATURE_RECURRING_PROBLEM_DETECTION_ENABLED",
  ],
] as const)("%s feature flag", (_name, resolveFlag, environmentName) => {
  it("is disabled unless explicitly enabled in every environment", () => {
    expect(resolveFlag(undefined)).toBe(false);
    expect(resolveFlag("true")).toBe(true);
    expect(resolveFlag("off")).toBe(false);
  });

  it("rejects ambiguous values", () => {
    expect(() => resolveFlag("enabled")).toThrow(environmentName);
  });
});
