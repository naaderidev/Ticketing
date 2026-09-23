import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_INTERVAL_SECONDS = 60;
const DEFAULT_RECURRING_PROBLEM_INTERVAL_SECONDS = 60 * 60;
const REQUEST_TIMEOUT_MILLISECONDS = 20_000;

function boundedInteger(name, value, fallback, minimum, maximum) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

export function resolveMaintenanceConfiguration(environment = process.env) {
  const demoMode = ["1", "true", "yes", "on"].includes(
    environment.DEMO_MODE?.trim().toLowerCase() ?? ""
  );
  const allowDemoFallback = demoMode || environment.NODE_ENV !== "production";
  const fallbackToken = allowDemoFallback
    ? environment.ATTACHMENT_CLEANUP_TOKEN?.trim()
    : undefined;
  const slaToken = environment.SLA_MAINTENANCE_TOKEN?.trim() || fallbackToken;
  const reportingToken =
    environment.REPORTING_MAINTENANCE_TOKEN?.trim() ||
    environment.SLA_MAINTENANCE_TOKEN?.trim() ||
    fallbackToken;
  const attachmentToken = environment.ATTACHMENT_CLEANUP_TOKEN?.trim();
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
    environment.MAINTENANCE_BASE_URL?.trim() || DEFAULT_BASE_URL
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
      environment.MAINTENANCE_INTERVAL_SECONDS,
      DEFAULT_INTERVAL_SECONDS,
      30,
      300
    ) * 1_000,
    recurringProblemIntervalMilliseconds: boundedInteger(
      "MAINTENANCE_RECURRING_PROBLEM_INTERVAL_SECONDS",
      environment.MAINTENANCE_RECURRING_PROBLEM_INTERVAL_SECONDS,
      DEFAULT_RECURRING_PROBLEM_INTERVAL_SECONDS,
      15 * 60,
      24 * 60 * 60
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
    const error = new Error(
      `Maintenance endpoint ${path} returned HTTP ${response.status}`
    );
    error.httpStatus = response.status;
    const retryAfter = Number(response.headers.get("retry-after"));
    error.retryAfterSeconds = Number.isSafeInteger(retryAfter) && retryAfter > 0
      ? retryAfter
      : null;
    throw error;
  }
  return response.json();
}

export function maintenanceJobs(config) {
  return [
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
      intervalMilliseconds: config.recurringProblemIntervalMilliseconds,
    },
    {
      path: "/api/internal/attachments/cleanup",
      token: "attachmentToken",
    },
  ];
}

async function runCycle(config, nextRunAt) {
  for (const job of maintenanceJobs(config)) {
    if ((nextRunAt.get(job.path) ?? 0) > Date.now()) continue;
    const startedAt = Date.now();
    try {
      await invokeJob(config, job);
      nextRunAt.set(
        job.path,
        startedAt + (job.intervalMilliseconds ?? config.intervalMilliseconds)
      );
      log("info", "maintenance_job_succeeded", {
        path: job.path,
        durationMilliseconds: Date.now() - startedAt,
      });
    } catch (error) {
      const rateLimited = error?.httpStatus === 429;
      const retryAfterSeconds = error?.retryAfterSeconds ?? null;
      nextRunAt.set(
        job.path,
        Date.now() + Math.max(
          config.intervalMilliseconds,
          retryAfterSeconds ? retryAfterSeconds * 1_000 : 0
        )
      );
      log(rateLimited ? "warn" : "error", rateLimited
        ? "maintenance_job_deferred"
        : "maintenance_job_failed", {
        path: job.path,
        errorType: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : "Unknown failure",
        ...(rateLimited ? { httpStatus: 429, retryAfterSeconds } : {}),
      });
    }
  }
}

export async function runMaintenanceScheduler(environment = process.env) {
  const config = resolveMaintenanceConfiguration(environment);
  const nextRunAt = new Map();
  let stopping = false;
  let running = false;
  let timer;

  async function tick() {
    if (stopping || running) return;
    running = true;
    try {
      await runCycle(config, nextRunAt);
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
    recurringProblemIntervalMilliseconds:
      config.recurringProblemIntervalMilliseconds,
  });
  await tick();
}

function isMainModule() {
  return process.argv[1]
    ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;
}

if (isMainModule()) {
  await runMaintenanceScheduler();
}
