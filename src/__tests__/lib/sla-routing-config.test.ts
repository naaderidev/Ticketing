import { resolveSlaRoutingConfig } from "@/lib/sla-routing-config";

const token = "sla-maintenance-token-with-at-least-32-characters";

describe("SLA routing configuration", () => {
  it("uses bounded safe defaults", () => {
    expect(
      resolveSlaRoutingConfig({ SLA_MAINTENANCE_TOKEN: token })
    ).toEqual({
      maintenanceToken: token,
      batchSize: 100,
      lockSeconds: 120,
      outboxMaxAttempts: 5,
    });
  });

  it("accepts the existing maintenance token outside production and in explicit demo mode", () => {
    expect(
      resolveSlaRoutingConfig({
        NODE_ENV: "development",
        ATTACHMENT_CLEANUP_TOKEN: token,
      }).maintenanceToken
    ).toBe(token);
    expect(() =>
      resolveSlaRoutingConfig({
        NODE_ENV: "production",
        ATTACHMENT_CLEANUP_TOKEN: token,
      })
    ).toThrow("SLA_MAINTENANCE_TOKEN");
    expect(
      resolveSlaRoutingConfig({
        NODE_ENV: "production",
        DEMO_MODE: "true",
        ATTACHMENT_CLEANUP_TOKEN: token,
      }).maintenanceToken
    ).toBe(token);
  });

  it.each([
    ["SLA_JOB_BATCH_SIZE", "0"],
    ["SLA_JOB_LOCK_SECONDS", "901"],
    ["OUTBOX_MAX_ATTEMPTS", "1.5"],
  ])("rejects invalid %s", (name, value) => {
    expect(() =>
      resolveSlaRoutingConfig({
        SLA_MAINTENANCE_TOKEN: token,
        [name]: value,
      })
    ).toThrow(name);
  });
});
