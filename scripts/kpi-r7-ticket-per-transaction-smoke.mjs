import { spawnSync } from "node:child_process";
import path from "node:path";

const jestBin = path.join(process.cwd(), "node_modules", "jest", "bin", "jest.js");
const result = spawnSync(
  process.execPath,
  [jestBin, "--runInBand", "src/__tests__/database/ticket-per-transaction-integration.test.ts"],
  {
    cwd: process.cwd(),
    env: { ...process.env, RUN_TICKET_PER_TRANSACTION_INTEGRATION: "1" },
    stdio: "inherit",
  }
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
