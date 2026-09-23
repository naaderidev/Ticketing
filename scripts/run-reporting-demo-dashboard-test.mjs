import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const hostname = new URL(databaseUrl).hostname.toLowerCase();
if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
  throw new Error("Reporting demo integration is restricted to a local database");
}

const result = spawnSync(
  process.execPath,
  [
    "node_modules/jest/bin/jest.js",
    "--runInBand",
    "src/__tests__/database/reporting-demo-seed-integration.test.ts",
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RUN_REPORTING_DEMO_SEED_INTEGRATION: "1",
    },
    stdio: "inherit",
  }
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
