import { writeFile } from "node:fs/promises";
import path from "node:path";
import { runProductionVerification } from "./production-verification.mjs";

function outputPathFromArguments(argumentsList) {
  const outputIndex = argumentsList.indexOf("--output");
  if (outputIndex === -1) return null;
  const outputPath = argumentsList[outputIndex + 1];
  if (!outputPath || outputPath.startsWith("--")) {
    throw new Error("--output requires a file path");
  }
  return path.resolve(outputPath);
}

const report = await runProductionVerification(process.env);
const serialized = `${JSON.stringify(report, null, 2)}\n`;
const outputPath = outputPathFromArguments(process.argv.slice(2));

if (outputPath) {
  await writeFile(outputPath, serialized, "utf8");
  console.log(`Production verification evidence written to ${outputPath}`);
} else {
  process.stdout.write(serialized);
}
if (!report.ok) process.exitCode = 1;
