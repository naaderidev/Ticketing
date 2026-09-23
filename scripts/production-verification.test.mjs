import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveProductionVerificationConfiguration,
  runProductionVerification,
  verifyProductionEnvironment,
} from "./production-verification.mjs";

const metricsToken = "production-metrics-token-with-32-characters";
const expectedDeploymentVersion = "0123456789abcdef0123456789abcdef01234567";

function productionEnvironment(overrides = {}) {
  return {
    PRODUCTION_BASE_URL: "https://tickets.company.test",
    PRODUCTION_METRICS_TOKEN: metricsToken,
    EXPECTED_DEPLOYMENT_VERSION: expectedDeploymentVersion,
    PRODUCTION_CHECKPOINT: "initial",
    PRODUCTION_OBSERVATION_COUNT: "2",
    PRODUCTION_OBSERVATION_INTERVAL_MS: "1000",
    PRODUCTION_RELEASE_SAMPLE_COUNT: "3",
    PRODUCTION_REQUEST_TIMEOUT_MS: "5000",
    ...overrides,
  };
}

function responseHeaders(requestHeaders, contentType) {
  return {
    "cache-control": "no-store, max-age=0",
    "content-security-policy": "base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
    "content-type": contentType,
    "cross-origin-opener-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "referrer-policy": "strict-origin-when-cross-origin",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-request-id": requestHeaders.get("x-request-id"),
  };
}

function successfulFetch(version = expectedDeploymentVersion) {
  return async (url, options) => {
    const headers = new Headers(options.headers);
    const jsonHeaders = responseHeaders(headers, "application/json");

    if (url.pathname === "/api/health/live") {
      return Response.json({ status: "ok" }, { headers: jsonHeaders });
    }
    if (url.pathname === "/api/health/ready") {
      return Response.json({ status: "ready" }, { headers: jsonHeaders });
    }
    if (url.pathname === "/") {
      return new Response('<html lang="fa" dir="rtl"><body>تیکتینگ</body></html>', {
        headers: responseHeaders(headers, "text/html; charset=utf-8"),
      });
    }
    if (
      url.pathname === "/api/internal/sla/process" ||
      url.pathname === "/api/internal/tickets/lifecycle/process"
    ) {
      return Response.json({ error: "method not allowed" }, {
        status: 405,
        headers: jsonHeaders,
      });
    }
    if (url.pathname === "/api/internal/metrics" && !headers.has("authorization")) {
      return Response.json({ error: "unauthorized" }, {
        status: 401,
        headers: jsonHeaders,
      });
    }
    if (url.pathname === "/api/internal/metrics") {
      return new Response(
        `ticketing_build_info{version="${version}"} 1\nticketing_ready 1\n`,
        { headers: responseHeaders(headers, "text/plain; version=0.0.4") }
      );
    }
    throw new Error(`Unexpected path: ${url.pathname}`);
  };
}

test("accepts strict production observation configuration", () => {
  assert.deepEqual(
    resolveProductionVerificationConfiguration(productionEnvironment()),
    {
      baseUrl: "https://tickets.company.test",
      checkpoint: "initial",
      expectedDeploymentVersion,
      metricsToken,
      observationCount: 2,
      observationIntervalMs: 1000,
      releaseSampleCount: 3,
      timeoutMs: 5000,
    }
  );
});

test("rejects unsafe origins, weak credentials, and invalid checkpoints", () => {
  assert.throws(
    () => resolveProductionVerificationConfiguration(
      productionEnvironment({ PRODUCTION_BASE_URL: "http://tickets.company.test" })
    ),
    /must use HTTPS/
  );
  assert.throws(
    () => resolveProductionVerificationConfiguration(
      productionEnvironment({ PRODUCTION_METRICS_TOKEN: "short" })
    ),
    /32-512/
  );
  assert.throws(
    () => resolveProductionVerificationConfiguration(
      productionEnvironment({ PRODUCTION_CHECKPOINT: "done" })
    ),
    /initial, midpoint, or closure/
  );
});

test("bounds the observation plan and immutable release identity", () => {
  assert.throws(
    () => resolveProductionVerificationConfiguration(
      productionEnvironment({ EXPECTED_DEPLOYMENT_VERSION: "main" })
    ),
    /full lowercase 40-character Git commit SHA/
  );
  assert.throws(
    () => resolveProductionVerificationConfiguration(productionEnvironment({
      PRODUCTION_OBSERVATION_COUNT: "12",
      PRODUCTION_OBSERVATION_INTERVAL_MS: "300000",
    })),
    /must not exceed 15 minutes/
  );
});

test("records every successful observation and the planned interval", async () => {
  const configuration = resolveProductionVerificationConfiguration(productionEnvironment());
  const waits = [];
  const report = await verifyProductionEnvironment(configuration, {
    fetchImplementation: successfulFetch(),
    now: () => new Date("2026-09-14T09:00:00.000Z"),
    waitImplementation: async (milliseconds) => waits.push(milliseconds),
  });

  assert.equal(report.ok, true);
  assert.equal(report.decision, "OBSERVATION_PASS");
  assert.deepEqual(report.observationSummary, { required: 2, completed: 2, passed: 2 });
  assert.deepEqual(waits, [1000]);
  assert.equal(report.observations.every((item) => item.checks.length === 7), true);
});

test("fails closed and stops sampling after a bad production observation", async () => {
  const configuration = resolveProductionVerificationConfiguration(productionEnvironment());
  const waits = [];
  const report = await verifyProductionEnvironment(configuration, {
    fetchImplementation: successfulFetch("f".repeat(40)),
    waitImplementation: async (milliseconds) => waits.push(milliseconds),
  });

  assert.equal(report.ok, false);
  assert.equal(report.decision, "ROLLBACK_REVIEW_REQUIRED");
  assert.deepEqual(report.observationSummary, { required: 2, completed: 1, passed: 0 });
  assert.deepEqual(waits, []);
});

test("never exposes the production metrics token in failure evidence", async () => {
  const report = await runProductionVerification(productionEnvironment(), {
    fetchImplementation: async () => {
      throw new Error(`upstream rejected ${metricsToken}`);
    },
    waitImplementation: async () => undefined,
  });

  assert.equal(report.ok, false);
  assert.equal(JSON.stringify(report).includes(metricsToken), false);
});
