import { spawnSync } from "node:child_process";
import path from "node:path";

const jestBin = path.join(process.cwd(), "node_modules", "jest", "bin", "jest.js");
const result = spawnSync(
  process.execPath,
  [jestBin, "--runInBand", "src/__tests__/database/reporting-api-access-integration.test.ts"],
  {
    cwd: process.cwd(),
    env: { ...process.env, RUN_REPORTING_API_ACCESS_INTEGRATION: "1" },
    stdio: "inherit",
  }
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
