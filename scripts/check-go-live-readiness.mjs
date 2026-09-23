import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createGoLiveReadinessReport,
  REQUIRED_GO_LIVE_GATES,
  resolveEvidenceRelativePath,
} from "./go-live-evidence.mjs";

const MAXIMUM_EVIDENCE_BYTES = 256 * 1024;

function requireEnvironmentValue(key) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function outputPathFromArguments(argumentsList) {
  const outputIndex = argumentsList.indexOf("--output");
  if (outputIndex === -1) return null;
  const outputPath = argumentsList[outputIndex + 1];
  if (!outputPath || outputPath.startsWith("--")) throw new Error("--output requires a file path");
  return path.resolve(outputPath);
}

async function readEvidence(repositoryRoot) {
  const expectedReleaseId = requireEnvironmentValue("EXPECTED_RELEASE_ID");
  const relativePath = requireEnvironmentValue("GO_LIVE_EVIDENCE_PATH");
  const normalizedPath = resolveEvidenceRelativePath(relativePath, expectedReleaseId);
  const evidencePath = path.join(repositoryRoot, ...normalizedPath.split("/"));
  const metadata = await stat(evidencePath);
  if (!metadata.isFile() || metadata.size > MAXIMUM_EVIDENCE_BYTES) {
    throw new Error("Go-Live evidence must be a regular JSON file no larger than 256 KiB");
  }
  const source = await readFile(evidencePath, "utf8");
  let document;
  try {
    document = JSON.parse(source);
  } catch {
    throw new Error("Go-Live evidence must contain valid JSON");
  }
  return { document, expectedReleaseId };
}

function configurationFailure(error) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    releaseId: null,
    decision: "NO_GO",
    ok: false,
    gateSummary: {
      required: Object.keys(REQUIRED_GO_LIVE_GATES).length,
      supplied: 0,
      passed: 0,
    },
    errors: [error instanceof Error ? error.message : "Unknown Go-Live evidence error"],
  };
}

let report;
try {
  const { document, expectedReleaseId } = await readEvidence(process.cwd());
  report = createGoLiveReadinessReport(document, { expectedReleaseId });
} catch (error) {
  report = configurationFailure(error);
}

const serialized = `${JSON.stringify(report, null, 2)}\n`;
const outputPath = outputPathFromArguments(process.argv.slice(2));
if (outputPath) {
  await writeFile(outputPath, serialized, "utf8");
  console.log(`Go-Live readiness evidence written to ${outputPath}`);
} else {
  process.stdout.write(serialized);
}
if (!report.ok) process.exitCode = 1;
