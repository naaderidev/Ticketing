import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { assertSafeDemoResetTarget } from "./demo-reset-safety.mjs";

const argumentsList = process.argv.slice(2);
assertSafeDemoResetTarget({ environment: process.env, argumentsList });

function runNodeScript(scriptPath, scriptArguments) {
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArguments], {
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runNodeScript(resolve("node_modules/prisma/build/index.js"), [
  "db",
  "push",
  "--force-reset",
  "--accept-data-loss",
  "--skip-generate",
]);
runNodeScript(resolve("scripts/reset-and-seed-product-data.mjs"), argumentsList);
