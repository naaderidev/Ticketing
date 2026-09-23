import { verifyReadOnlyRuntimeEnvironment } from "./staging-rehearsal.mjs";

const RELEASE_ID_PATTERN = /^[a-f0-9]{40}$/;
const MINIMUM_TOKEN_LENGTH = 32;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_RELEASE_SAMPLE_COUNT = 5;
const DEFAULT_OBSERVATION_COUNT = 3;
const DEFAULT_OBSERVATION_INTERVAL_MS = 15_000;
const MAXIMUM_OBSERVATION_WINDOW_MS = 15 * 60 * 1000;
const CHECKPOINTS = new Set(["initial", "midpoint", "closure"]);

function requireEnvironmentValue(environment, key) {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function parseBoundedInteger(value, { field, minimum, maximum }) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${field} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

function validateProductionOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PRODUCTION_BASE_URL must be a valid absolute URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("PRODUCTION_BASE_URL must use HTTPS");
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "PRODUCTION_BASE_URL must be an exact origin without credentials, path, query, or fragment"
    );
  }
  return url.origin;
}

function validateMetricsToken(value) {
  if (
    value.length < MINIMUM_TOKEN_LENGTH ||
    value.length > 512 ||
    !/^[\x21-\x7e]+$/.test(value)
  ) {
    throw new Error("PRODUCTION_METRICS_TOKEN must be 32-512 visible ASCII characters");
  }
  return value;
}

export function resolveProductionVerificationConfiguration(environment) {
  const baseUrl = validateProductionOrigin(
    requireEnvironmentValue(environment, "PRODUCTION_BASE_URL")
  );
  const metricsToken = validateMetricsToken(
    requireEnvironmentValue(environment, "PRODUCTION_METRICS_TOKEN")
  );
  const expectedDeploymentVersion = requireEnvironmentValue(
    environment,
    "EXPECTED_DEPLOYMENT_VERSION"
  );
  const checkpoint = requireEnvironmentValue(environment, "PRODUCTION_CHECKPOINT");

  if (!RELEASE_ID_PATTERN.test(expectedDeploymentVersion)) {
    throw new Error(
      "EXPECTED_DEPLOYMENT_VERSION must be the full lowercase 40-character Git commit SHA"
    );
  }
  if (!CHECKPOINTS.has(checkpoint)) {
    throw new Error("PRODUCTION_CHECKPOINT must be initial, midpoint, or closure");
  }

  const timeoutMs = parseBoundedInteger(
    environment.PRODUCTION_REQUEST_TIMEOUT_MS?.trim() || String(DEFAULT_REQUEST_TIMEOUT_MS),
    { field: "PRODUCTION_REQUEST_TIMEOUT_MS", minimum: 1_000, maximum: 30_000 }
  );
  const releaseSampleCount = parseBoundedInteger(
    environment.PRODUCTION_RELEASE_SAMPLE_COUNT?.trim() ||
      String(DEFAULT_RELEASE_SAMPLE_COUNT),
    { field: "PRODUCTION_RELEASE_SAMPLE_COUNT", minimum: 3, maximum: 20 }
  );
  const observationCount = parseBoundedInteger(
    environment.PRODUCTION_OBSERVATION_COUNT?.trim() ||
      String(DEFAULT_OBSERVATION_COUNT),
    { field: "PRODUCTION_OBSERVATION_COUNT", minimum: 2, maximum: 12 }
  );
  const observationIntervalMs = parseBoundedInteger(
    environment.PRODUCTION_OBSERVATION_INTERVAL_MS?.trim() ||
      String(DEFAULT_OBSERVATION_INTERVAL_MS),
    {
      field: "PRODUCTION_OBSERVATION_INTERVAL_MS",
      minimum: 1_000,
      maximum: 300_000,
    }
  );
  if ((observationCount - 1) * observationIntervalMs > MAXIMUM_OBSERVATION_WINDOW_MS) {
    throw new Error("Production observation window must not exceed 15 minutes");
  }

  return {
    baseUrl,
    checkpoint,
    expectedDeploymentVersion,
    metricsToken,
    observationCount,
    observationIntervalMs,
    releaseSampleCount,
    timeoutMs,
  };
}

function redactError(error, secret) {
  const message =
    error instanceof Error ? error.message : "Unknown production verification error";
  return secret ? message.replaceAll(secret, "[REDACTED]") : message;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function verifyProductionEnvironment(
  configuration,
  {
    fetchImplementation = globalThis.fetch,
    now = () => new Date(),
    waitImplementation = wait,
  } = {}
) {
  const observations = [];

  for (let sequence = 1; sequence <= configuration.observationCount; sequence += 1) {
    const runtimeReport = await verifyReadOnlyRuntimeEnvironment(
      configuration,
      fetchImplementation
    );
    observations.push({
      sequence,
      observedAt: now().toISOString(),
      status: runtimeReport.ok ? "pass" : "fail",
      checks: runtimeReport.checks,
    });

    if (!runtimeReport.ok) break;
    if (sequence < configuration.observationCount) {
      await waitImplementation(configuration.observationIntervalMs);
    }
  }

  const passed = observations.filter((observation) => observation.status === "pass").length;
  const ok = passed === configuration.observationCount;
  return {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    verificationType: "production-post-deployment",
    checkpoint: configuration.checkpoint,
    targetOrigin: configuration.baseUrl,
    expectedDeploymentVersion: configuration.expectedDeploymentVersion,
    decision: ok ? "OBSERVATION_PASS" : "ROLLBACK_REVIEW_REQUIRED",
    ok,
    observationSummary: {
      required: configuration.observationCount,
      completed: observations.length,
      passed,
    },
    observations,
  };
}

export async function runProductionVerification(
  environment,
  dependencies = {}
) {
  try {
    const configuration = resolveProductionVerificationConfiguration(environment);
    return await verifyProductionEnvironment(configuration, dependencies);
  } catch (error) {
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      verificationType: "production-post-deployment",
      checkpoint: environment.PRODUCTION_CHECKPOINT?.trim() || null,
      targetOrigin: null,
      expectedDeploymentVersion:
        environment.EXPECTED_DEPLOYMENT_VERSION?.trim() || null,
      decision: "ROLLBACK_REVIEW_REQUIRED",
      ok: false,
      observationSummary: { required: 0, completed: 0, passed: 0 },
      observations: [],
      errors: [redactError(error, environment.PRODUCTION_METRICS_TOKEN)],
    };
  }
}
