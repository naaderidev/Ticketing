import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveMaintenanceBaseUrl,
  resolveNextHostname,
  resolveNextPort,
} from "./run-ticketing-runtime.mjs";
import {
  maintenanceJobs,
  resolveMaintenanceConfiguration,
} from "./maintenance-scheduler.mjs";

const maintenanceToken = "maintenance-token-with-at-least-32-characters";

test("resolves the Next.js port from supported CLI forms", () => {
  assert.equal(resolveNextPort(["-p", "3010"], {}), 3010);
  assert.equal(resolveNextPort(["--port", "3011"], {}), 3011);
  assert.equal(resolveNextPort(["--port=3012"], {}), 3012);
});

test("falls back to PORT and then the Next.js default", () => {
  assert.equal(resolveNextPort([], { PORT: "4010" }), 4010);
  assert.equal(resolveNextPort([], {}), 3000);
});

test("resolves the standalone hostname from CLI and environment", () => {
  assert.equal(resolveNextHostname(["-H", "127.0.0.1"], {}), "127.0.0.1");
  assert.equal(
    resolveNextHostname(["--hostname=172.20.40.214"], {}),
    "172.20.40.214"
  );
  assert.equal(resolveNextHostname([], { HOSTNAME: "ticketing" }), "ticketing");
  assert.equal(resolveNextHostname([], {}), "0.0.0.0");
});

test("derives the maintenance URL from the effective application port", () => {
  assert.equal(
    resolveMaintenanceBaseUrl(["-p", "3009"], {}),
    "http://127.0.0.1:3009"
  );
});

test("uses the colocated application instead of a standalone scheduler origin", () => {
  assert.equal(
    resolveMaintenanceBaseUrl([], {
      MAINTENANCE_BASE_URL: "http://ticketing.internal:8080/",
    }),
    "http://127.0.0.1:3000"
  );
});

test("rejects invalid ports", () => {
  assert.throws(() => resolveNextPort(["--port", "0"], {}), /between 1 and 65535/);
});

test("rejects missing hostname values", () => {
  assert.throws(() => resolveNextHostname(["--hostname"], {}), /requires a hostname/);
});

test("allows the shared maintenance token only for explicit demo production", () => {
  const config = resolveMaintenanceConfiguration({
    NODE_ENV: "production",
    DEMO_MODE: "true",
    ATTACHMENT_CLEANUP_TOKEN: maintenanceToken,
  });
  assert.equal(config.slaToken, maintenanceToken);
  assert.equal(config.reportingToken, maintenanceToken);
  assert.throws(
    () => resolveMaintenanceConfiguration({
      NODE_ENV: "production",
      ATTACHMENT_CLEANUP_TOKEN: maintenanceToken,
    }),
    /SLA_MAINTENANCE_TOKEN/
  );
});

test("schedules recurring-problem detection hourly by default", () => {
  const config = resolveMaintenanceConfiguration({
    SLA_MAINTENANCE_TOKEN: maintenanceToken,
    REPORTING_MAINTENANCE_TOKEN: maintenanceToken,
    ATTACHMENT_CLEANUP_TOKEN: maintenanceToken,
  });
  const recurringJob = maintenanceJobs(config).find(
    (job) => job.path === "/api/internal/reporting/recurring-problems/process"
  );
  assert.equal(recurringJob?.intervalMilliseconds, 60 * 60 * 1_000);
});
