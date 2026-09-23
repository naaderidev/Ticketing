import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveReportingControlledRolloutConfiguration,
  validateReportingRolloutTransition,
  verifyReportingControlledRollout,
} from "./reporting-controlled-rollout.mjs";

const releaseId = "a".repeat(40);
const metricsToken = "metrics-token-with-at-least-32-characters";
const reportingToken = "reporting-token-with-at-least-32-characters";

function configuration(stage, fromStage = stage) {
  return resolveReportingControlledRolloutConfiguration({
    REPORTING_ROLLOUT_BASE_URL: "https://tickets.example.test",
    REPORTING_ROLLOUT_FROM_STAGE: fromStage,
    REPORTING_ROLLOUT_TARGET_STAGE: stage,
    REPORTING_ROLLOUT_METRICS_TOKEN: metricsToken,
    REPORTING_ROLLOUT_MAINTENANCE_TOKEN: reportingToken,
    REPORTING_ROLLOUT_OBSERVATION_COUNT: "2",
    EXPECTED_DEPLOYMENT_VERSION: releaseId,
  });
}

function metrics(stage) {
  const projectionEnabled = stage === "DISABLED" ? 0 : 1;
  const apiEnabled = stage === "CANARY" || stage === "GENERAL" ? 1 : 0;
  return [
    `ticketing_build_info{version="${releaseId}"} 1`,
    "ticketing_ready 1",
    `ticketing_reporting_rollout_stage{stage="${stage}"} 1`,
    `ticketing_reporting_projection_enabled ${projectionEnabled}`,
    `ticketing_reporting_api_enabled ${apiEnabled}`,
  ].join("\n");
}

function fetchForStage(stage, { ready = true } = {}) {
  return async (url, options = {}) => {
    const pathname = new URL(url).pathname;
    if (pathname === "/api/health/ready") {
      return Response.json({ status: "ready" }, { status: 200 });
    }
    if (pathname === "/api/internal/metrics") {
      assert.equal(options.headers.authorization, `Bearer ${metricsToken}`);
      return new Response(metrics(stage), { status: 200 });
    }
    if (pathname === "/api/internal/reporting/readiness") {
      assert.equal(options.headers.authorization, `Bearer ${reportingToken}`);
      return Response.json({
        rollout: {
          stage,
          projectionEnabled: stage !== "DISABLED",
          apiEnabled: stage === "CANARY" || stage === "GENERAL",
          canaryActorCount: stage === "CANARY" ? 1 : 0,
        },
        reconciliation: {
          ready,
          blockers: ready ? [] : ["CHECKPOINT_HEALTHY"],
          warnings: ["HEALTHY_FACT_COVERAGE"],
          checkpoint: { status: ready ? "HEALTHY" : "FAILED", leaseActive: false },
          counts: { sourceEvents: 59, processedEvents: ready ? 59 : 58 },
        },
      });
    }
    if (pathname === "/api/v2/reporting/access") {
      const apiEnabled = stage === "CANARY" || stage === "GENERAL";
      return Response.json({}, { status: apiEnabled ? 401 : 404 });
    }
    if (
      pathname === "/api/internal/reporting/process" &&
      options.method === "POST"
    ) {
      return Response.json({}, { status: 401 });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
}

test("allows one-step promotion, same-stage verification, and rollback", () => {
  assert.deepEqual(validateReportingRolloutTransition("DISABLED", "SHADOW"), []);
  assert.deepEqual(validateReportingRolloutTransition("CANARY", "CANARY"), []);
  assert.deepEqual(validateReportingRolloutTransition("GENERAL", "DISABLED"), []);
  assert.equal(
    validateReportingRolloutTransition("DISABLED", "CANARY").length,
    1
  );
});

test("validates a healthy SHADOW promotion across repeated observations", async () => {
  const report = await verifyReportingControlledRollout(
    configuration("SHADOW", "DISABLED"),
    {
      fetchImplementation: fetchForStage("SHADOW"),
      now: () => new Date("2026-09-15T00:00:00.000Z"),
    }
  );
  assert.equal(report.ok, true);
  assert.equal(report.decision, "ADVANCE_APPROVED");
  assert.equal(report.observationSummary.passed, 2);
});

test("validates a canary stage only when a canary actor exists", async () => {
  const report = await verifyReportingControlledRollout(
    configuration("CANARY", "SHADOW"),
    { fetchImplementation: fetchForStage("CANARY") }
  );
  assert.equal(report.ok, true);
  assert.equal(report.decision, "ADVANCE_APPROVED");
});

test("holds immediately when reconciliation has a blocker", async () => {
  const report = await verifyReportingControlledRollout(
    configuration("GENERAL", "CANARY"),
    { fetchImplementation: fetchForStage("GENERAL", { ready: false }) }
  );
  assert.equal(report.ok, false);
  assert.equal(report.decision, "HOLD");
  assert.equal(report.observationSummary.completed, 1);
});

test("rejects a skipped promotion and unsafe configuration", () => {
  assert.throws(
    () => configuration("GENERAL", "DISABLED"),
    /cannot skip/
  );
  assert.throws(
    () =>
      resolveReportingControlledRolloutConfiguration({
        REPORTING_ROLLOUT_BASE_URL: "http://tickets.example.test",
        REPORTING_ROLLOUT_FROM_STAGE: "DISABLED",
        REPORTING_ROLLOUT_TARGET_STAGE: "SHADOW",
        REPORTING_ROLLOUT_METRICS_TOKEN: metricsToken,
        REPORTING_ROLLOUT_MAINTENANCE_TOKEN: reportingToken,
        EXPECTED_DEPLOYMENT_VERSION: releaseId,
      }),
    /exact HTTPS origin/
  );
});
