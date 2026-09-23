import { writeFile } from "node:fs/promises";
import path from "node:path";
import { runReportingControlledRollout } from "./reporting-controlled-rollout.mjs";

const argumentsList = process.argv.slice(2);
const outputIndex = argumentsList.indexOf("--output");
const outputValue = outputIndex === -1 ? null : argumentsList[outputIndex + 1];
if (outputIndex !== -1 && (!outputValue || outputValue.startsWith("--"))) {
  throw new Error("--output requires a file path");
}

const report = await runReportingControlledRollout(process.env);
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputValue) {
  const outputPath = path.resolve(outputValue);
  await writeFile(outputPath, serialized, "utf8");
  console.log(`Reporting rollout evidence written to ${outputPath}`);
} else {
  process.stdout.write(serialized);
}
if (!report.ok) process.exitCode = 1;
