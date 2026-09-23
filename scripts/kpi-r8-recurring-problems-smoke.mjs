import { spawnSync } from "node:child_process";
import path from "node:path";

const jestBin = path.join(process.cwd(), "node_modules", "jest", "bin", "jest.js");
const result = spawnSync(
  process.execPath,
  [jestBin, "--runInBand", "src/__tests__/database/recurring-problem-integration.test.ts"],
  {
    cwd: process.cwd(),
    env: { ...process.env, RUN_RECURRING_PROBLEM_INTEGRATION: "1" },
    stdio: "inherit",
  }
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
