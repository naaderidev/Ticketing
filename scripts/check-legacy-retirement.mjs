import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createLegacyRetirementReport,
  REQUIRED_LEGACY_SURFACES,
  REQUIRED_RETIREMENT_APPROVALS,
  REQUIRED_RETIREMENT_FEATURE_FLAGS,
  resolveRetirementEvidenceRelativePath,
} from "./legacy-retirement-evidence.mjs";

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

async function readRetirementEvidence(repositoryRoot) {
  const expectedReleaseId = requireEnvironmentValue("EXPECTED_RELEASE_ID");
  const expectedClosureRevision = requireEnvironmentValue("EXPECTED_CLOSURE_REVISION");
  const relativePath = requireEnvironmentValue("LEGACY_RETIREMENT_EVIDENCE_PATH");
  const normalizedPath = resolveRetirementEvidenceRelativePath(relativePath, expectedReleaseId);
  const evidencePath = path.join(repositoryRoot, ...normalizedPath.split("/"));
  const metadata = await stat(evidencePath);
  if (!metadata.isFile() || metadata.size > MAXIMUM_EVIDENCE_BYTES) {
    throw new Error("Legacy retirement evidence must be a regular JSON file no larger than 256 KiB");
  }
  let document;
  try {
    document = JSON.parse(await readFile(evidencePath, "utf8"));
  } catch {
    throw new Error("Legacy retirement evidence must contain valid JSON");
  }
  return { document, expectedClosureRevision, expectedReleaseId };
}

function configurationFailure(error) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    releaseId: null,
    decision: "KEEP_LEGACY",
    ok: false,
    summary: {
      requiredFeatureFlags: REQUIRED_RETIREMENT_FEATURE_FLAGS.length,
      suppliedFeatureFlags: 0,
      requiredLegacySurfaces: REQUIRED_LEGACY_SURFACES.length,
      suppliedLegacySurfaces: 0,
      requiredApprovals: REQUIRED_RETIREMENT_APPROVALS.length,
      suppliedApprovals: 0,
    },
    errors: [error instanceof Error ? error.message : "Unknown Legacy retirement error"],
  };
}

let report;
try {
  const evidence = await readRetirementEvidence(process.cwd());
  report = createLegacyRetirementReport(evidence.document, evidence);
} catch (error) {
  report = configurationFailure(error);
}

const serialized = `${JSON.stringify(report, null, 2)}\n`;
const outputPath = outputPathFromArguments(process.argv.slice(2));
if (outputPath) {
  await writeFile(outputPath, serialized, "utf8");
  console.log(`Legacy retirement readiness written to ${outputPath}`);
} else {
  process.stdout.write(serialized);
}
if (!report.ok) process.exitCode = 1;
