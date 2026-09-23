import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const hostname = new URL(databaseUrl).hostname;
if (!new Set(["localhost", "127.0.0.1", "::1"]).has(hostname)) {
  throw new Error("KPI R3 smoke test is restricted to a local database");
}

const result = spawnSync(
  process.execPath,
  [
    "node_modules/jest/bin/jest.js",
    "--runInBand",
    "src/__tests__/database/reporting-projection-integration.test.ts",
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      RUN_REPORTING_PROJECTION_INTEGRATION: "1",
    },
    stdio: "inherit",
  }
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
