import { writeFile } from "node:fs/promises";
import path from "node:path";
import { checkReleaseReadiness } from "./release-readiness.mjs";

function outputPathFromArguments(argumentsList) {
  const outputIndex = argumentsList.indexOf("--output");
  if (outputIndex === -1) {
    return null;
  }

  const outputPath = argumentsList[outputIndex + 1];
  if (!outputPath || outputPath.startsWith("--")) {
    throw new Error("--output requires a file path");
  }

  return path.resolve(outputPath);
}

function hasArgument(argumentsList, argument) {
  return argumentsList.includes(argument);
}

const argumentsList = process.argv.slice(2);
const report = await checkReleaseReadiness(process.cwd(), {
  requireReleaseId: hasArgument(argumentsList, "--require-release-id"),
});
const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
const outputPath = outputPathFromArguments(argumentsList);

if (outputPath) {
  await writeFile(outputPath, serializedReport, "utf8");
  console.log(`Release contract evidence written to ${outputPath}`);
} else {
  process.stdout.write(serializedReport);
}

if (!report.ok) {
  process.exitCode = 1;
}
