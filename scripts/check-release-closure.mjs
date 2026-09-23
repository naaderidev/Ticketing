import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createReleaseClosureReport,
  REQUIRED_CLOSURE_APPROVALS,
  REQUIRED_CLOSURE_CHECKPOINTS,
  resolveClosureEvidenceRelativePath,
} from "./release-closure-evidence.mjs";

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
  if (!outputPath || outputPath.startsWith("--")) {
    throw new Error("--output requires a file path");
  }
  return path.resolve(outputPath);
}

async function readClosureEvidence(repositoryRoot) {
  const expectedReleaseId = requireEnvironmentValue("EXPECTED_RELEASE_ID");
  const expectedGoLiveEvidenceRevision = requireEnvironmentValue(
    "EXPECTED_GO_LIVE_EVIDENCE_REVISION"
  );
  const relativePath = requireEnvironmentValue("RELEASE_CLOSURE_EVIDENCE_PATH");
  const normalizedPath = resolveClosureEvidenceRelativePath(relativePath, expectedReleaseId);
  const evidencePath = path.join(repositoryRoot, ...normalizedPath.split("/"));
  const metadata = await stat(evidencePath);
  if (!metadata.isFile() || metadata.size > MAXIMUM_EVIDENCE_BYTES) {
    throw new Error("Release closure evidence must be a regular JSON file no larger than 256 KiB");
  }
  let document;
  try {
    document = JSON.parse(await readFile(evidencePath, "utf8"));
  } catch {
    throw new Error("Release closure evidence must contain valid JSON");
  }
  return { document, expectedGoLiveEvidenceRevision, expectedReleaseId };
}

function configurationFailure(error) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    releaseId: null,
    decision: "KEEP_OPEN",
    ok: false,
    checkpointSummary: {
      required: REQUIRED_CLOSURE_CHECKPOINTS.length,
      supplied: 0,
      passed: 0,
    },
    approvalSummary: {
      required: REQUIRED_CLOSURE_APPROVALS.length,
      supplied: 0,
    },
    errors: [error instanceof Error ? error.message : "Unknown release closure error"],
  };
}

let report;
try {
  const evidence = await readClosureEvidence(process.cwd());
  report = createReleaseClosureReport(evidence.document, evidence);
} catch (error) {
  report = configurationFailure(error);
}

const serialized = `${JSON.stringify(report, null, 2)}\n`;
const outputPath = outputPathFromArguments(process.argv.slice(2));
if (outputPath) {
  await writeFile(outputPath, serialized, "utf8");
  console.log(`Release closure evidence written to ${outputPath}`);
} else {
  process.stdout.write(serialized);
}
if (!report.ok) process.exitCode = 1;
