const RELEASE_ID_PATTERN = /^[a-f0-9]{40}$/;
const STAGES = Object.freeze(["DISABLED", "SHADOW", "CANARY", "GENERAL"]);
const MINIMUM_TOKEN_LENGTH = 32;
const MAXIMUM_RESPONSE_BYTES = 128 * 1024;

function requireValue(environment, key) {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function parseStage(value, field) {
  const stage = value.trim().toUpperCase();
  if (!STAGES.includes(stage)) {
    throw new Error(`${field} must be one of ${STAGES.join(", ")}`);
  }
  return stage;
}

function parseBoundedInteger(value, field, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${field} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

function validateToken(value, field) {
  if (
    value.length < MINIMUM_TOKEN_LENGTH ||
    value.length > 512 ||
    !/^[\x21-\x7e]+$/.test(value)
  ) {
    throw new Error(`${field} must contain 32-512 visible ASCII characters`);
  }
  return value;
}

function validateOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("REPORTING_ROLLOUT_BASE_URL must be a valid absolute URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "REPORTING_ROLLOUT_BASE_URL must be an exact HTTPS origin without credentials"
    );
  }
  return url.origin;
}

export function validateReportingRolloutTransition(fromStage, targetStage) {
  const fromIndex = STAGES.indexOf(fromStage);
  const targetIndex = STAGES.indexOf(targetStage);
  if (fromIndex === -1 || targetIndex === -1) {
    return ["Unknown Reporting rollout stage"];
  }
  if (targetIndex > fromIndex + 1) {
    return [`Reporting rollout cannot skip from ${fromStage} to ${targetStage}`];
  }
  return [];
}

export function resolveReportingControlledRolloutConfiguration(environment) {
  const fromStage = parseStage(
    requireValue(environment, "REPORTING_ROLLOUT_FROM_STAGE"),
    "REPORTING_ROLLOUT_FROM_STAGE"
  );
  const targetStage = parseStage(
    requireValue(environment, "REPORTING_ROLLOUT_TARGET_STAGE"),
    "REPORTING_ROLLOUT_TARGET_STAGE"
  );
  const transitionErrors = validateReportingRolloutTransition(
    fromStage,
    targetStage
  );
  if (transitionErrors.length > 0) throw new Error(transitionErrors[0]);

  const expectedDeploymentVersion = requireValue(
    environment,
    "EXPECTED_DEPLOYMENT_VERSION"
  );
  if (!RELEASE_ID_PATTERN.test(expectedDeploymentVersion)) {
    throw new Error(
      "EXPECTED_DEPLOYMENT_VERSION must be the full lowercase 40-character Git commit SHA"
    );
  }

  return {
    baseUrl: validateOrigin(requireValue(environment, "REPORTING_ROLLOUT_BASE_URL")),
    expectedDeploymentVersion,
    fromStage,
    targetStage,
    metricsToken: validateToken(
      requireValue(environment, "REPORTING_ROLLOUT_METRICS_TOKEN"),
      "REPORTING_ROLLOUT_METRICS_TOKEN"
    ),
    reportingToken: validateToken(
      requireValue(environment, "REPORTING_ROLLOUT_MAINTENANCE_TOKEN"),
      "REPORTING_ROLLOUT_MAINTENANCE_TOKEN"
    ),
    observationCount: parseBoundedInteger(
      environment.REPORTING_ROLLOUT_OBSERVATION_COUNT?.trim() || "3",
      "REPORTING_ROLLOUT_OBSERVATION_COUNT",
      2,
      12
    ),
    timeoutMs: parseBoundedInteger(
      environment.REPORTING_ROLLOUT_REQUEST_TIMEOUT_MS?.trim() || "10000",
      "REPORTING_ROLLOUT_REQUEST_TIMEOUT_MS",
      1_000,
      30_000
    ),
  };
}

async function readLimitedText(response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > MAXIMUM_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Response exceeded the 128 KiB rollout verification limit");
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

async function request(configuration, pathname, options, fetchImplementation) {
  return fetchImplementation(new URL(pathname, configuration.baseUrl), {
    method: options?.method ?? "GET",
    headers: options?.headers,
    redirect: "manual",
    signal: AbortSignal.timeout(configuration.timeoutMs),
  });
}

function expectStatus(response, expected, endpoint) {
  if (response.status !== expected) {
    throw new Error(`${endpoint} returned HTTP ${response.status}; expected ${expected}`);
  }
}

async function readJson(response, endpoint) {
  const text = await readLimitedText(response);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${endpoint} returned invalid JSON`);
  }
}

function expectedStageFlags(stage) {
  return {
    projectionEnabled: stage !== "DISABLED",
    apiEnabled: stage === "CANARY" || stage === "GENERAL",
  };
}

async function verifyOneObservation(configuration, fetchImplementation) {
  const checks = [];
  const run = async (name, operation) => {
    try {
      const details = await operation();
      checks.push({ name, status: "pass", ...(details ? { details } : {}) });
    } catch (error) {
      checks.push({
        name,
        status: "fail",
        error: error instanceof Error ? error.message : "Unknown rollout error",
      });
    }
  };

  await run("runtime-readiness", async () => {
    const response = await request(
      configuration,
      "/api/health/ready",
      undefined,
      fetchImplementation
    );
    expectStatus(response, 200, "Readiness endpoint");
    const body = await readJson(response, "Readiness endpoint");
    if (body.status !== "ready") throw new Error("Runtime is not ready");
  });

  await run("release-and-stage-metrics", async () => {
    const response = await request(
      configuration,
      "/api/internal/metrics",
      {
        headers: { authorization: `Bearer ${configuration.metricsToken}` },
      },
      fetchImplementation
    );
    expectStatus(response, 200, "Metrics endpoint");
    const metrics = (await readLimitedText(response)).split(/\r?\n/);
    const flags = expectedStageFlags(configuration.targetStage);
    for (const line of [
      `ticketing_build_info{version="${configuration.expectedDeploymentVersion}"} 1`,
      "ticketing_ready 1",
      `ticketing_reporting_rollout_stage{stage="${configuration.targetStage}"} 1`,
      `ticketing_reporting_projection_enabled ${flags.projectionEnabled ? 1 : 0}`,
      `ticketing_reporting_api_enabled ${flags.apiEnabled ? 1 : 0}`,
    ]) {
      if (!metrics.includes(line)) throw new Error(`Required metric is missing: ${line}`);
    }
    return { stage: configuration.targetStage };
  });

  await run("reporting-reconciliation", async () => {
    const response = await request(
      configuration,
      "/api/internal/reporting/readiness",
      {
        headers: { authorization: `Bearer ${configuration.reportingToken}` },
      },
      fetchImplementation
    );
    expectStatus(response, 200, "Reporting readiness endpoint");
    const body = await readJson(response, "Reporting readiness endpoint");
    const flags = expectedStageFlags(configuration.targetStage);
    if (body.rollout?.stage !== configuration.targetStage) {
      throw new Error("Runtime Reporting stage does not match the target stage");
    }
    if (
      body.rollout?.projectionEnabled !== flags.projectionEnabled ||
      body.rollout?.apiEnabled !== flags.apiEnabled
    ) {
      throw new Error("Runtime Reporting flags do not match the target stage");
    }
    if (
      configuration.targetStage === "CANARY" &&
      !(body.rollout?.canaryActorCount > 0)
    ) {
      throw new Error("CANARY stage has no configured actors");
    }
    if (
      configuration.targetStage !== "CANARY" &&
      body.rollout?.canaryActorCount !== 0
    ) {
      throw new Error("Non-CANARY stage contains stale canary actors");
    }
    if (
      body.reconciliation?.ready !== true ||
      body.reconciliation?.blockers?.length !== 0 ||
      body.reconciliation?.checkpoint?.status !== "HEALTHY" ||
      body.reconciliation?.checkpoint?.leaseActive !== false ||
      body.reconciliation?.counts?.sourceEvents !==
        body.reconciliation?.counts?.processedEvents
    ) {
      throw new Error("Reporting reconciliation is not release-ready");
    }
    return {
      warningCount: body.reconciliation.warnings?.length ?? 0,
      sourceEvents: body.reconciliation.counts.sourceEvents,
    };
  });

  await run("public-boundaries", async () => {
    const apiEnabled = expectedStageFlags(configuration.targetStage).apiEnabled;
    const accessResponse = await request(
      configuration,
      "/api/v2/reporting/access",
      undefined,
      fetchImplementation
    );
    expectStatus(
      accessResponse,
      apiEnabled ? 401 : 404,
      "Unauthenticated Reporting access endpoint"
    );
    const processResponse = await request(
      configuration,
      "/api/internal/reporting/process",
      { method: "POST" },
      fetchImplementation
    );
    expectStatus(
      processResponse,
      401,
      "Unauthenticated Reporting projection endpoint"
    );
  });

  return { ok: checks.every((check) => check.status === "pass"), checks };
}

function successDecision(fromStage, targetStage) {
  const fromIndex = STAGES.indexOf(fromStage);
  const targetIndex = STAGES.indexOf(targetStage);
  if (targetIndex < fromIndex) return "ROLLBACK_VERIFIED";
  if (targetIndex === fromIndex) return "STAGE_VERIFIED";
  return "ADVANCE_APPROVED";
}

export async function verifyReportingControlledRollout(
  configuration,
  { fetchImplementation = globalThis.fetch, now = () => new Date() } = {}
) {
  const observations = [];
  for (
    let sequence = 1;
    sequence <= configuration.observationCount;
    sequence += 1
  ) {
    const result = await verifyOneObservation(configuration, fetchImplementation);
    observations.push({
      sequence,
      observedAt: now().toISOString(),
      status: result.ok ? "pass" : "fail",
      checks: result.checks,
    });
    if (!result.ok) break;
  }
  const ok = observations.length === configuration.observationCount &&
    observations.every((observation) => observation.status === "pass");
  return {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    verificationType: "reporting-controlled-rollout",
    expectedDeploymentVersion: configuration.expectedDeploymentVersion,
    fromStage: configuration.fromStage,
    targetStage: configuration.targetStage,
    targetOrigin: configuration.baseUrl,
    decision: ok
      ? successDecision(configuration.fromStage, configuration.targetStage)
      : "HOLD",
    ok,
    observationSummary: {
      required: configuration.observationCount,
      completed: observations.length,
      passed: observations.filter((item) => item.status === "pass").length,
    },
    observations,
  };
}

function redactError(error, environment) {
  let message = error instanceof Error ? error.message : "Unknown rollout error";
  for (const key of [
    "REPORTING_ROLLOUT_METRICS_TOKEN",
    "REPORTING_ROLLOUT_MAINTENANCE_TOKEN",
  ]) {
    const secret = environment[key];
    if (secret) message = message.replaceAll(secret, "[REDACTED]");
  }
  return message;
}

export async function runReportingControlledRollout(environment, dependencies) {
  try {
    const configuration = resolveReportingControlledRolloutConfiguration(environment);
    return await verifyReportingControlledRollout(configuration, dependencies);
  } catch (error) {
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      verificationType: "reporting-controlled-rollout",
      expectedDeploymentVersion:
        environment.EXPECTED_DEPLOYMENT_VERSION?.trim() || null,
      fromStage: environment.REPORTING_ROLLOUT_FROM_STAGE?.trim() || null,
      targetStage: environment.REPORTING_ROLLOUT_TARGET_STAGE?.trim() || null,
      targetOrigin: null,
      decision: "HOLD",
      ok: false,
      observationSummary: { required: 0, completed: 0, passed: 0 },
      observations: [],
      errors: [redactError(error, environment)],
    };
  }
}
