const CONFIRMATION = "RESET_DEMO_DATABASE";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isEnabled(value) {
  return ["1", "true", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function confirmationFrom(argumentsList) {
  return argumentsList
    .find((argument) => argument.startsWith("--confirm="))
    ?.slice("--confirm=".length);
}

export function assertSafeDemoResetTarget({ environment, argumentsList }) {
  if (!isEnabled(environment.DEMO_MODE)) {
    throw new Error("Demo database reset requires DEMO_MODE=true");
  }
  if (!isEnabled(environment.ALLOW_DEMO_DATABASE_RESET)) {
    throw new Error(
      "Demo database reset requires ALLOW_DEMO_DATABASE_RESET=true"
    );
  }
  if (confirmationFrom(argumentsList) !== CONFIRMATION) {
    throw new Error(`Reset refused. Pass --confirm=${CONFIRMATION}`);
  }

  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  let parsedDatabaseUrl;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid URL");
  }
  if (!parsedDatabaseUrl.protocol.startsWith("mysql")) {
    throw new Error("Demo database reset supports only MySQL URLs");
  }

  const hostname = parsedDatabaseUrl.hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(hostname)) return;

  const allowedHosts = new Set(
    (environment.DEMO_DATABASE_HOST_ALLOWLIST ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  if (!allowedHosts.has(hostname)) {
    throw new Error(
      "Reset refused for a database host outside DEMO_DATABASE_HOST_ALLOWLIST"
    );
  }

  const databaseName = decodeURIComponent(
    parsedDatabaseUrl.pathname.replace(/^\/+/, "")
  );
  const confirmedDatabaseName =
    environment.DEMO_DATABASE_RESET_NAME?.trim();
  if (!confirmedDatabaseName || confirmedDatabaseName !== databaseName) {
    throw new Error(
      "DEMO_DATABASE_RESET_NAME must exactly match the non-local database name"
    );
  }
}

export const DEMO_RESET_CONFIRMATION = CONFIRMATION;
