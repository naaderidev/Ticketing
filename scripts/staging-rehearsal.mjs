import { randomUUID } from "node:crypto";

const RELEASE_ID_PATTERN = /^[a-f0-9]{40}$/;
const MINIMUM_TOKEN_LENGTH = 32;
const MAXIMUM_RESPONSE_BYTES = 128 * 1024;
const DEFAULT_RELEASE_SAMPLE_COUNT = 5;

function requireEnvironmentValue(environment, key) {
  const value = environment[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

export function resolveStagingConfiguration(environment) {
  const baseUrlValue = requireEnvironmentValue(environment, "STAGING_BASE_URL");
  const metricsToken = requireEnvironmentValue(environment, "STAGING_METRICS_TOKEN");
  const expectedDeploymentVersion = requireEnvironmentValue(
    environment,
    "EXPECTED_DEPLOYMENT_VERSION"
  );
  const timeoutValue = environment.STAGING_REQUEST_TIMEOUT_MS?.trim() || "10000";
  const releaseSampleCountValue =
    environment.STAGING_RELEASE_SAMPLE_COUNT?.trim() || String(DEFAULT_RELEASE_SAMPLE_COUNT);
  const timeoutMs = Number(timeoutValue);
  const releaseSampleCount = Number(releaseSampleCountValue);
  let baseUrl;

  try {
    baseUrl = new URL(baseUrlValue);
  } catch {
    throw new Error("STAGING_BASE_URL must be a valid absolute URL");
  }

  if (baseUrl.protocol !== "https:") {
    throw new Error("STAGING_BASE_URL must use HTTPS");
  }
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error("STAGING_BASE_URL must not contain credentials, a query, or a fragment");
  }
  if (baseUrl.pathname !== "/") {
    throw new Error("STAGING_BASE_URL must point to the application origin without a path");
  }
  if (
    metricsToken.length < MINIMUM_TOKEN_LENGTH ||
    metricsToken.length > 512 ||
    !/^[\x21-\x7e]+$/.test(metricsToken)
  ) {
    throw new Error("STAGING_METRICS_TOKEN must be 32-512 visible ASCII characters");
  }
  if (!RELEASE_ID_PATTERN.test(expectedDeploymentVersion)) {
    throw new Error(
      "EXPECTED_DEPLOYMENT_VERSION must be the full lowercase 40-character Git commit SHA"
    );
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    throw new Error("STAGING_REQUEST_TIMEOUT_MS must be an integer from 1000 to 30000");
  }
  if (
    !Number.isInteger(releaseSampleCount) ||
    releaseSampleCount < 3 ||
    releaseSampleCount > 20
  ) {
    throw new Error("STAGING_RELEASE_SAMPLE_COUNT must be an integer from 3 to 20");
  }

  return {
    baseUrl: baseUrl.origin,
    expectedDeploymentVersion,
    metricsToken,
    releaseSampleCount,
    timeoutMs,
  };
}

async function readLimitedText(response) {
  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }

  const decoder = new TextDecoder();
  let byteCount = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return text + decoder.decode();
      }

      byteCount += value.byteLength;
      if (byteCount > MAXIMUM_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Response body exceeded the 128 KiB rehearsal limit");
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function expectStatus(response, expectedStatus, endpointName) {
  if (response.status !== expectedStatus) {
    throw new Error(`${endpointName} returned HTTP ${response.status}; expected ${expectedStatus}`);
  }
}

function expectHeader(response, name, predicate, expectation) {
  const value = response.headers.get(name);
  if (!value || !predicate(value)) {
    throw new Error(`${name} header ${expectation}`);
  }
}

async function requestEndpoint(configuration, pathname, options, fetchImplementation) {
  const requestId = randomUUID();
  const headers = new Headers(options?.headers);
  headers.set("accept", options?.accept || "application/json");
  headers.set("x-request-id", requestId);

  const response = await fetchImplementation(
    new URL(pathname, configuration.baseUrl),
    {
      method: "GET",
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(configuration.timeoutMs),
    }
  );

  if (response.status >= 300 && response.status < 400) {
    throw new Error(`${pathname} returned an unexpected redirect`);
  }
  if (response.headers.get("x-request-id") !== requestId) {
    throw new Error(`${pathname} did not preserve the supplied request ID`);
  }

  return response;
}

async function expectJsonStatus(response, expectedStatus) {
  expectHeader(
    response,
    "content-type",
    (value) => value.toLowerCase().startsWith("application/json"),
    "must describe JSON"
  );
  const body = await readLimitedText(response);
  let parsed;

  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("Health endpoint returned invalid JSON");
  }

  if (parsed?.status !== expectedStatus) {
    throw new Error(`Health endpoint status must be ${expectedStatus}`);
  }
}

async function expectApplicationShell(response) {
  expectHeader(
    response,
    "content-type",
    (value) => value.toLowerCase().startsWith("text/html"),
    "must describe HTML"
  );
  const html = await readLimitedText(response);
  if (!/<html\b[^>]*\bdir=["']rtl["']/i.test(html)) {
    throw new Error("Landing page must render an RTL application shell");
  }
}

function redactError(error, secret) {
  const message = error instanceof Error ? error.message : "Unknown staging verification error";
  return secret ? message.replaceAll(secret, "[REDACTED]") : message;
}

async function runCheck(name, operation, secret) {
  try {
    const details = await operation();
    return {
      name,
      status: "pass",
      ...(details === undefined ? {} : { details }),
    };
  } catch (error) {
    return {
      name,
      status: "fail",
      error: redactError(error, secret),
    };
  }
}

export async function verifyReadOnlyRuntimeEnvironment(
  configuration,
  fetchImplementation = globalThis.fetch
) {
  const checks = [];

  checks.push(await runCheck("liveness", async () => {
    const response = await requestEndpoint(
      configuration,
      "/api/health/live",
      undefined,
      fetchImplementation
    );
    expectStatus(response, 200, "Liveness endpoint");
    await expectJsonStatus(response, "ok");
    expectHeader(
      response,
      "cache-control",
      (value) => value.includes("no-store"),
      "must disable caching"
    );
  }, configuration.metricsToken));

  checks.push(await runCheck("readiness", async () => {
    const response = await requestEndpoint(
      configuration,
      "/api/health/ready",
      undefined,
      fetchImplementation
    );
    expectStatus(response, 200, "Readiness endpoint");
    await expectJsonStatus(response, "ready");
    expectHeader(
      response,
      "cache-control",
      (value) => value.includes("no-store"),
      "must disable caching"
    );
  }, configuration.metricsToken));

  checks.push(await runCheck("security-headers", async () => {
    const response = await requestEndpoint(
      configuration,
      "/api/health/live",
      undefined,
      fetchImplementation
    );
    expectStatus(response, 200, "Liveness endpoint");
    expectHeader(response, "strict-transport-security", (value) => value.includes("includeSubDomains"), "must enforce HSTS for subdomains");
    expectHeader(response, "content-security-policy", (value) => value.includes("frame-ancestors 'none'") && value.includes("object-src 'none'"), "must block framing and object sources");
    expectHeader(response, "x-content-type-options", (value) => value.toLowerCase() === "nosniff", "must be nosniff");
    expectHeader(response, "x-frame-options", (value) => value.toUpperCase() === "DENY", "must be DENY");
    expectHeader(response, "referrer-policy", (value) => value === "strict-origin-when-cross-origin", "must use the approved policy");
    expectHeader(response, "cross-origin-opener-policy", (value) => value === "same-origin", "must be same-origin");
    expectHeader(response, "permissions-policy", (value) => value.includes("camera=()") && value.includes("microphone=()") && value.includes("geolocation=()"), "must disable camera, microphone, and geolocation");
    if (response.headers.has("x-powered-by")) {
      throw new Error("x-powered-by must not expose the application framework");
    }
  }, configuration.metricsToken));

  checks.push(await runCheck("application-shell", async () => {
    const response = await requestEndpoint(
      configuration,
      "/",
      { accept: "text/html" },
      fetchImplementation
    );
    expectStatus(response, 200, "Landing page");
    await expectApplicationShell(response);
    expectHeader(
      response,
      "cache-control",
      (value) => value.includes("no-store") || value.includes("no-cache"),
      "must prevent stale release caching"
    );
  }, configuration.metricsToken));

  checks.push(await runCheck("metrics-access-control", async () => {
    const response = await requestEndpoint(
      configuration,
      "/api/internal/metrics",
      { accept: "text/plain" },
      fetchImplementation
    );
    expectStatus(response, 401, "Unauthenticated metrics endpoint");
  }, configuration.metricsToken));

  checks.push(await runCheck("metrics-and-release-consistency", async () => {
    for (let sample = 1; sample <= configuration.releaseSampleCount; sample += 1) {
      const response = await requestEndpoint(
        configuration,
        "/api/internal/metrics",
        {
          accept: "text/plain",
          headers: {
            authorization: `Bearer ${configuration.metricsToken}`,
            "cache-control": "no-cache",
          },
        },
        fetchImplementation
      );
      expectStatus(response, 200, `Authenticated metrics endpoint sample ${sample}`);
      expectHeader(response, "content-type", (value) => value.toLowerCase().startsWith("text/plain"), "must describe Prometheus text");
      expectHeader(response, "cache-control", (value) => value.includes("no-store"), "must disable caching");
      const metrics = await readLimitedText(response);
      const buildMetric = `ticketing_build_info{version="${configuration.expectedDeploymentVersion}"} 1`;
      if (!metrics.split(/\r?\n/).includes(buildMetric)) {
        throw new Error(`Metrics sample ${sample} does not identify the expected immutable release`);
      }
      if (!metrics.split(/\r?\n/).includes("ticketing_ready 1")) {
        throw new Error(`Metrics sample ${sample} reports that the application is not ready`);
      }
    }
    return {
      deploymentVersion: configuration.expectedDeploymentVersion,
      samples: configuration.releaseSampleCount,
    };
  }, configuration.metricsToken));

  checks.push(await runCheck("maintenance-method-boundaries", async () => {
    for (const pathname of [
      "/api/internal/sla/process",
      "/api/internal/tickets/lifecycle/process",
    ]) {
      const response = await requestEndpoint(
        configuration,
        pathname,
        undefined,
        fetchImplementation
      );
      expectStatus(response, 405, `${pathname} read-only probe`);
    }
  }, configuration.metricsToken));

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    targetOrigin: configuration.baseUrl,
    expectedDeploymentVersion: configuration.expectedDeploymentVersion,
    ok: checks.every((item) => item.status === "pass"),
    checks,
  };
}

export function verifyStagingEnvironment(
  configuration,
  fetchImplementation = globalThis.fetch
) {
  return verifyReadOnlyRuntimeEnvironment(configuration, fetchImplementation);
}

export async function runStagingRehearsal(
  environment,
  fetchImplementation = globalThis.fetch
) {
  try {
    const configuration = resolveStagingConfiguration(environment);
    return await verifyStagingEnvironment(configuration, fetchImplementation);
  } catch (error) {
    return {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      targetOrigin: null,
      expectedDeploymentVersion: environment.EXPECTED_DEPLOYMENT_VERSION?.trim() || null,
      ok: false,
      checks: [
        {
          name: "staging-configuration",
          status: "fail",
          error: redactError(error, environment.STAGING_METRICS_TOKEN),
        },
      ],
    };
  }
}
