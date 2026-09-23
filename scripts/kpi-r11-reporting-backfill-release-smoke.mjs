import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const hostname = new URL(databaseUrl).hostname;
if (!new Set(["localhost", "127.0.0.1", "::1"]).has(hostname)) {
  throw new Error(
    "KPI R11 backfill is restricted to a local or disposable database"
  );
}

const result = spawnSync(
  process.execPath,
  [
    "node_modules/jest/bin/jest.js",
    "--runInBand",
    "src/__tests__/database/reporting-backfill-release-integration.test.ts",
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      RUN_REPORTING_BACKFILL_RELEASE_INTEGRATION: "1",
      REPORTING_RECONCILIATION_OUTPUT: "1",
    },
    stdio: "inherit",
  }
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
