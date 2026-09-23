const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_INTERVAL_SECONDS = 60;
const REQUEST_TIMEOUT_MILLISECONDS = 20_000;

function boundedInteger(name, value, fallback, minimum, maximum) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function configuration() {
  const slaToken = process.env.SLA_MAINTENANCE_TOKEN?.trim()
    || (process.env.NODE_ENV === "production"
      ? ""
      : process.env.ATTACHMENT_CLEANUP_TOKEN?.trim());
  const reportingToken = process.env.REPORTING_MAINTENANCE_TOKEN?.trim();
  const attachmentToken = process.env.ATTACHMENT_CLEANUP_TOKEN?.trim();
  if (!slaToken || slaToken.length < 32) {
    throw new Error("SLA_MAINTENANCE_TOKEN must contain at least 32 characters");
  }
  if (!reportingToken || reportingToken.length < 32) {
    throw new Error(
      "REPORTING_MAINTENANCE_TOKEN must contain at least 32 characters"
    );
  }
  if (!attachmentToken || attachmentToken.length < 32) {
    throw new Error(
      "ATTACHMENT_CLEANUP_TOKEN must contain at least 32 characters"
    );
  }
  const baseUrl = new URL(
    process.env.MAINTENANCE_BASE_URL?.trim() || DEFAULT_BASE_URL
  );
  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new Error("MAINTENANCE_BASE_URL must use http or https");
  }
  return {
    slaToken,
    reportingToken,
    attachmentToken,
    baseUrl: baseUrl.toString().replace(/\/$/, ""),
    intervalMilliseconds: boundedInteger(
      "MAINTENANCE_INTERVAL_SECONDS",
      process.env.MAINTENANCE_INTERVAL_SECONDS,
      DEFAULT_INTERVAL_SECONDS,
      30,
      300
    ) * 1_000,
  };
}

function log(level, event, attributes = {}) {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "ticketing-maintenance-scheduler",
    ...attributes,
  })}\n`);
}

async function invokeJob(config, job) {
  const token = config[job.token];
  const path = job.path;
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
  });
  if (!response.ok) {
    throw new Error(`Maintenance endpoint ${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function runCycle(config) {
  for (const job of [
    { path: "/api/internal/sla/process", token: "slaToken" },
    { path: "/api/internal/tickets/lifecycle/process", token: "slaToken" },
    { path: "/api/internal/reporting/process", token: "reportingToken" },
    {
      path: "/api/internal/reporting/support-journeys/process",
      token: "reportingToken",
    },
    {
      path: "/api/internal/reporting/recurring-problems/process",
      token: "reportingToken",
    },
    {
      path: "/api/internal/attachments/cleanup",
      token: "attachmentToken",
    },
  ]) {
    const startedAt = Date.now();
    try {
      await invokeJob(config, job);
      log("info", "maintenance_job_succeeded", {
        path: job.path,
        durationMilliseconds: Date.now() - startedAt,
      });
    } catch (error) {
      log("error", "maintenance_job_failed", {
        path: job.path,
        errorType: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : "Unknown failure",
      });
    }
  }
}

const config = configuration();
let stopping = false;
let running = false;
let timer;

async function tick() {
  if (stopping || running) return;
  running = true;
  try {
    await runCycle(config);
  } finally {
    running = false;
    if (!stopping) timer = setTimeout(tick, config.intervalMilliseconds);
  }
}

function stop(signal) {
  stopping = true;
  if (timer) clearTimeout(timer);
  log("info", "maintenance_scheduler_stopping", { signal });
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
log("info", "maintenance_scheduler_started", {
  baseUrl: config.baseUrl,
  intervalMilliseconds: config.intervalMilliseconds,
});
await tick();
