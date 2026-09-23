import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveStagingConfiguration,
  runStagingRehearsal,
  verifyStagingEnvironment,
} from "./staging-rehearsal.mjs";

const metricsToken = "staging-metrics-token-with-32-characters";
const expectedDeploymentVersion = "0123456789abcdef0123456789abcdef01234567";

function stagingEnvironment(overrides = {}) {
  return {
    STAGING_BASE_URL: "https://staging.example.test",
    STAGING_METRICS_TOKEN: metricsToken,
    EXPECTED_DEPLOYMENT_VERSION: expectedDeploymentVersion,
    STAGING_RELEASE_SAMPLE_COUNT: "3",
    STAGING_REQUEST_TIMEOUT_MS: "5000",
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
    const commonHeaders = responseHeaders(headers, "application/json");

    if (url.pathname === "/api/health/live") {
      return Response.json({ status: "ok" }, { headers: commonHeaders });
    }
    if (url.pathname === "/api/health/ready") {
      return Response.json({ status: "ready" }, { headers: commonHeaders });
    }
    if (url.pathname === "/") {
      return new Response('<!doctype html><html lang="fa" dir="rtl"><body>تیکتینگ</body></html>', {
        headers: responseHeaders(headers, "text/html; charset=utf-8"),
      });
    }
    if (
      url.pathname === "/api/internal/sla/process" ||
      url.pathname === "/api/internal/tickets/lifecycle/process"
    ) {
      return Response.json(
        { error: "method not allowed" },
        { status: 405, headers: commonHeaders }
      );
    }
    if (url.pathname === "/api/internal/metrics" && !headers.has("authorization")) {
      return Response.json(
        { error: "unauthorized" },
        { status: 401, headers: commonHeaders }
      );
    }
    if (url.pathname === "/api/internal/metrics") {
      return new Response(
        `ticketing_build_info{version="${version}"} 1\nticketing_ready 1\n`,
        {
          headers: responseHeaders(headers, "text/plain; version=0.0.4"),
        }
      );
    }

    throw new Error(`Unexpected path: ${url.pathname}`);
  };
}

test("accepts a strict HTTPS staging configuration", () => {
  assert.deepEqual(resolveStagingConfiguration(stagingEnvironment()), {
    baseUrl: "https://staging.example.test",
    expectedDeploymentVersion,
    metricsToken,
    releaseSampleCount: 3,
    timeoutMs: 5000,
  });
});

test("rejects insecure or ambiguous staging targets", () => {
  assert.throws(
    () => resolveStagingConfiguration(stagingEnvironment({
      STAGING_BASE_URL: "http://staging.example.test",
    })),
    /must use HTTPS/
  );
  assert.throws(
    () => resolveStagingConfiguration(stagingEnvironment({
      STAGING_BASE_URL: "https://staging.example.test/app",
    })),
    /without a path/
  );
});

test("rejects weak metrics credentials and invalid release identifiers", () => {
  assert.throws(
    () => resolveStagingConfiguration(stagingEnvironment({
      STAGING_METRICS_TOKEN: "short",
    })),
    /32-512/
  );
  assert.throws(
    () => resolveStagingConfiguration(stagingEnvironment({
      EXPECTED_DEPLOYMENT_VERSION: "bad release id",
    })),
    /full lowercase 40-character Git commit SHA/
  );
  assert.throws(
    () => resolveStagingConfiguration(stagingEnvironment({
      STAGING_RELEASE_SAMPLE_COUNT: "2",
    })),
    /integer from 3 to 20/
  );
});

test("passes all read-only staging acceptance checks", async () => {
  const configuration = resolveStagingConfiguration(stagingEnvironment());
  const report = await verifyStagingEnvironment(configuration, successfulFetch());

  assert.equal(report.ok, true);
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.checks.length, 7);
  assert.equal(report.checks.every((check) => check.status === "pass"), true);
  assert.equal(
    report.checks.find((check) => check.name === "metrics-and-release-consistency")
      ?.details?.samples,
    3
  );
});

test("fails closed when the deployed release identity does not match", async () => {
  const configuration = resolveStagingConfiguration(stagingEnvironment());
  const report = await verifyStagingEnvironment(
    configuration,
    successfulFetch("different-release")
  );

  assert.equal(report.ok, false);
  assert.equal(
    report.checks.find(
      (check) => check.name === "metrics-and-release-consistency"
    )?.status,
    "fail"
  );
});

test("fails closed when any sampled replica reports a different release", async () => {
  const configuration = resolveStagingConfiguration(stagingEnvironment());
  const stableFetch = successfulFetch();
  const mismatchedFetch = successfulFetch("f".repeat(40));
  let metricsRequests = 0;
  const fetchImplementation = async (url, options) => {
    if (url.pathname === "/api/internal/metrics" && new Headers(options.headers).has("authorization")) {
      metricsRequests += 1;
      if (metricsRequests === 2) return mismatchedFetch(url, options);
    }
    return stableFetch(url, options);
  };

  const report = await verifyStagingEnvironment(configuration, fetchImplementation);

  assert.equal(report.ok, false);
  assert.equal(
    report.checks.find((check) => check.name === "metrics-and-release-consistency")?.status,
    "fail"
  );
});

test("fails when the application shell is not RTL HTML", async () => {
  const configuration = resolveStagingConfiguration(stagingEnvironment());
  const stableFetch = successfulFetch();
  const fetchImplementation = async (url, options) => {
    if (url.pathname === "/") {
      return new Response("not the application", {
        headers: responseHeaders(new Headers(options.headers), "text/plain"),
      });
    }
    return stableFetch(url, options);
  };

  const report = await verifyStagingEnvironment(configuration, fetchImplementation);

  assert.equal(report.ok, false);
  assert.equal(
    report.checks.find((check) => check.name === "application-shell")?.status,
    "fail"
  );
});

test("never exposes the metrics token in configuration failure evidence", async () => {
  const report = await runStagingRehearsal(
    stagingEnvironment({ STAGING_BASE_URL: "not-a-url" })
  );

  assert.equal(report.ok, false);
  assert.equal(JSON.stringify(report).includes(metricsToken), false);
});
