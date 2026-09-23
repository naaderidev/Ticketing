import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const NEXT_BINARY_PATH = resolve("node_modules/next/dist/bin/next");
const STANDALONE_SERVER_PATH = resolve(".next/standalone/server.js");
const SCHEDULER_PATH = resolve("scripts/maintenance-scheduler.mjs");
const DEFAULT_PORT = 3000;
const STARTUP_TIMEOUT_MILLISECONDS = 120_000;
const HEALTH_REQUEST_TIMEOUT_MILLISECONDS = 2_000;
const HEALTH_POLL_INTERVAL_MILLISECONDS = 500;
const HEALTH_STABILITY_MILLISECONDS = 500;
const SHUTDOWN_TIMEOUT_MILLISECONDS = 5_000;

function parsePort(name, value) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}

function parseHostname(name, value) {
  if (!value?.trim()) throw new Error(`${name} requires a hostname`);
  return value.trim();
}

export function resolveNextPort(
  nextArguments,
  environment = process.env
) {
  for (let index = 0; index < nextArguments.length; index += 1) {
    const argument = nextArguments[index];
    if (argument === "-p" || argument === "--port") {
      return parsePort(argument, nextArguments[index + 1]);
    }
    if (argument.startsWith("--port=")) {
      return parsePort("--port", argument.slice("--port=".length));
    }
  }
  return environment.PORT?.trim()
    ? parsePort("PORT", environment.PORT)
    : DEFAULT_PORT;
}

export function resolveMaintenanceBaseUrl(
  nextArguments,
  environment = process.env
) {
  return `http://127.0.0.1:${resolveNextPort(nextArguments, environment)}`;
}

export function resolveNextHostname(
  nextArguments,
  environment = process.env
) {
  for (let index = 0; index < nextArguments.length; index += 1) {
    const argument = nextArguments[index];
    if (argument === "-H" || argument === "--hostname") {
      return parseHostname(argument, nextArguments[index + 1]);
    }
    if (argument.startsWith("--hostname=")) {
      return parseHostname(
        "--hostname",
        argument.slice("--hostname=".length)
      );
    }
  }
  return environment.HOSTNAME?.trim()
    ? parseHostname("HOSTNAME", environment.HOSTNAME)
    : "0.0.0.0";
}

function log(level, event, attributes = {}) {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "ticketing-runtime-supervisor",
    ...attributes,
  })}\n`);
}

function startNodeProcess(argumentsList, environment) {
  return spawn(process.execPath, argumentsList, {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
    windowsHide: true,
  });
}

function startApplication(mode, nextArguments, environment) {
  if (mode === "start" && existsSync(STANDALONE_SERVER_PATH)) {
    return startNodeProcess([STANDALONE_SERVER_PATH], {
      ...environment,
      PORT: String(resolveNextPort(nextArguments, environment)),
      HOSTNAME: resolveNextHostname(nextArguments, environment),
    });
  }
  return startNodeProcess(
    [NEXT_BINARY_PATH, mode, ...nextArguments],
    environment
  );
}

async function waitForApplication(application, baseUrl) {
  const healthUrl = `${baseUrl}/api/health/live`;
  const deadline = Date.now() + STARTUP_TIMEOUT_MILLISECONDS;
  while (Date.now() < deadline) {
    if (application.exitCode !== null) {
      throw new Error(`Next.js exited before becoming healthy (${application.exitCode})`);
    }
    try {
      const response = await fetch(healthUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(HEALTH_REQUEST_TIMEOUT_MILLISECONDS),
      });
      if (response.ok) {
        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, HEALTH_STABILITY_MILLISECONDS)
        );
        if (application.exitCode !== null) {
          throw new Error(
            `Next.js exited during the readiness check (${application.exitCode})`
          );
        }
        return;
      }
    } catch {
      // The application is still starting; the bounded loop retries shortly.
    }
    await new Promise((resolveDelay) =>
      setTimeout(resolveDelay, HEALTH_POLL_INTERVAL_MILLISECONDS)
    );
  }
  throw new Error(`Next.js did not become healthy at ${healthUrl}`);
}

export async function runTicketingRuntime({
  mode,
  nextArguments,
  environment = process.env,
}) {
  if (mode !== "dev" && mode !== "start") {
    throw new Error('Runtime mode must be either "dev" or "start"');
  }

  const maintenanceBaseUrl = resolveMaintenanceBaseUrl(
    nextArguments,
    environment
  );
  const children = new Map();
  let shuttingDown = false;
  let shutdownExitCode = 0;
  let forcedShutdownTimer;

  const finishShutdownWhenReady = () => {
    if (!shuttingDown || children.size > 0) return;
    if (forcedShutdownTimer) clearTimeout(forcedShutdownTimer);
    process.exitCode = shutdownExitCode;
  };

  const shutdown = (exitCode, reason) => {
    if (shuttingDown) return;
    shuttingDown = true;
    shutdownExitCode = exitCode;
    log("info", "runtime_shutdown_started", { reason, exitCode });
    for (const child of children.keys()) {
      if (child.exitCode === null) child.kill("SIGTERM");
    }
    forcedShutdownTimer = setTimeout(() => {
      for (const child of children.keys()) {
        if (child.exitCode === null) child.kill("SIGKILL");
      }
      process.exit(shutdownExitCode);
    }, SHUTDOWN_TIMEOUT_MILLISECONDS);
    forcedShutdownTimer.unref();
    finishShutdownWhenReady();
  };

  const trackChild = (child, name) => {
    children.set(child, name);
    child.once("exit", (code, signal) => {
      children.delete(child);
      const expectedShutdown = shuttingDown;
      log(code === 0 || expectedShutdown ? "info" : "error", "runtime_child_exited", {
        child: name,
        code,
        signal,
      });
      if (!shuttingDown) shutdown(code ?? 1, `${name}_exited`);
      finishShutdownWhenReady();
    });
    child.once("error", (error) => {
      log("error", "runtime_child_failed", {
        child: name,
        errorType: error.name,
        message: error.message,
      });
      shutdown(1, `${name}_failed`);
    });
    return child;
  };

  process.once("SIGINT", () => shutdown(0, "SIGINT"));
  process.once("SIGTERM", () => shutdown(0, "SIGTERM"));

  const application = trackChild(
    startApplication(mode, nextArguments, environment),
    "next"
  );

  try {
    await waitForApplication(application, maintenanceBaseUrl);
  } catch (error) {
    log("error", "runtime_application_start_failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown failure",
    });
    shutdown(1, "application_unhealthy");
    return;
  }
  if (shuttingDown) return;

  log("info", "runtime_application_ready", { mode, maintenanceBaseUrl });
  trackChild(
    startNodeProcess([SCHEDULER_PATH], {
      ...environment,
      MAINTENANCE_BASE_URL: maintenanceBaseUrl,
    }),
    "maintenance-scheduler"
  );
}

function isMainModule() {
  return process.argv[1]
    ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;
}

if (isMainModule()) {
  runTicketingRuntime({
    mode: process.argv[2],
    nextArguments: process.argv.slice(3),
  }).catch((error) => {
    log("error", "runtime_supervisor_failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown failure",
    });
    process.exitCode = 1;
  });
}
