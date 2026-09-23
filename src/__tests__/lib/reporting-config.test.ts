import { resolveReportingConfig } from "@/lib/reporting-config";

const token = "reporting-maintenance-token-with-32-characters";

describe("reporting configuration", () => {
  it("uses bounded defaults", () => {
    expect(
      resolveReportingConfig({ REPORTING_MAINTENANCE_TOKEN: token })
    ).toEqual({
      maintenanceToken: token,
      batchSize: 100,
      leaseSeconds: 120,
      maxRebuildEvents: 100_000,
      rebuildSleepMilliseconds: 0,
    });
  });

  it("accepts an existing token outside production and in explicit demo mode", () => {
    expect(
      resolveReportingConfig({
        NODE_ENV: "development",
        SLA_MAINTENANCE_TOKEN: token,
      }).maintenanceToken
    ).toBe(token);
    expect(() =>
      resolveReportingConfig({
        NODE_ENV: "production",
        SLA_MAINTENANCE_TOKEN: token,
      })
    ).toThrow("REPORTING_MAINTENANCE_TOKEN");
    expect(
      resolveReportingConfig({
        NODE_ENV: "production",
        DEMO_MODE: "true",
        SLA_MAINTENANCE_TOKEN: token,
      }).maintenanceToken
    ).toBe(token);
  });

  it("uses the existing local maintenance token as the final development fallback", () => {
    expect(
      resolveReportingConfig({
        NODE_ENV: "development",
        ATTACHMENT_CLEANUP_TOKEN: token,
      }).maintenanceToken
    ).toBe(token);
  });

  it.each([
    ["REPORTING_PROJECTION_BATCH_SIZE", "0"],
    ["REPORTING_PROJECTION_LEASE_SECONDS", "901"],
    ["REPORTING_REBUILD_MAX_EVENTS", "0.5"],
    ["REPORTING_REBUILD_SLEEP_MS", "5001"],
  ])("rejects invalid %s", (name, value) => {
    expect(() =>
      resolveReportingConfig({
        REPORTING_MAINTENANCE_TOKEN: token,
        [name]: value,
      })
    ).toThrow(name);
  });
});
