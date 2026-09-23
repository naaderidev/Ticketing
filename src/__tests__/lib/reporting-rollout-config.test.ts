import {
  isReportingActorAllowedInRollout,
  resolveReportingRolloutConfig,
} from "@/lib/reporting-rollout-config";

describe("reporting controlled rollout configuration", () => {
  it.each([
    ["DISABLED", false, false],
    ["SHADOW", true, false],
    ["CANARY", true, true],
    ["GENERAL", true, true],
  ] as const)(
    "maps %s to a valid projection/API combination",
    (stage, projectionEnabled, apiEnabled) => {
      const config = resolveReportingRolloutConfig({
        REPORTING_ROLLOUT_STAGE: stage,
        REPORTING_CANARY_USER_IDS: stage === "CANARY" ? "7,11" : undefined,
      });
      expect(config).toMatchObject({ stage, projectionEnabled, apiEnabled });
    }
  );

  it("fails closed by default in production and stays convenient locally", () => {
    expect(resolveReportingRolloutConfig({ NODE_ENV: "production" }).stage).toBe(
      "DISABLED"
    );
    expect(resolveReportingRolloutConfig({ NODE_ENV: "development" }).stage).toBe(
      "GENERAL"
    );
  });

  it("rejects skipped or contradictory rollout configuration", () => {
    expect(() =>
      resolveReportingRolloutConfig({
        REPORTING_ROLLOUT_STAGE: "SHADOW",
        FEATURE_REPORTING_API_ENABLED: "true",
      })
    ).toThrow("FEATURE_REPORTING_API_ENABLED");
    expect(() =>
      resolveReportingRolloutConfig({ REPORTING_ROLLOUT_STAGE: "CANARY" })
    ).toThrow("REPORTING_CANARY_USER_IDS");
    expect(() =>
      resolveReportingRolloutConfig({
        REPORTING_ROLLOUT_STAGE: "GENERAL",
        REPORTING_CANARY_USER_IDS: "7",
      })
    ).toThrow("outside the CANARY stage");
  });

  it("restricts only the canary stage to the explicit user allowlist", () => {
    const canary = resolveReportingRolloutConfig({
      REPORTING_ROLLOUT_STAGE: "CANARY",
      REPORTING_CANARY_USER_IDS: "7,11",
    });
    expect(isReportingActorAllowedInRollout(7, canary)).toBe(true);
    expect(isReportingActorAllowedInRollout(8, canary)).toBe(false);

    const general = resolveReportingRolloutConfig({
      REPORTING_ROLLOUT_STAGE: "GENERAL",
    });
    expect(isReportingActorAllowedInRollout(8, general)).toBe(true);
  });

  it("rejects duplicate, malformed, and excessive canary identifiers", () => {
    for (const value of ["7,7", "0", "1.5", "abc"]) {
      expect(() =>
        resolveReportingRolloutConfig({
          REPORTING_ROLLOUT_STAGE: "CANARY",
          REPORTING_CANARY_USER_IDS: value,
        })
      ).toThrow("REPORTING_CANARY_USER_IDS");
    }
    expect(() =>
      resolveReportingRolloutConfig({
        REPORTING_ROLLOUT_STAGE: "CANARY",
        REPORTING_CANARY_USER_IDS: Array.from(
          { length: 101 },
          (_, index) => String(index + 1)
        ).join(","),
      })
    ).toThrow("more than 100");
  });
});
