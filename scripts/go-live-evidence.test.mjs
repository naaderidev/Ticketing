import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createGoLiveReadinessReport,
  REQUIRED_GO_LIVE_GATES,
  resolveEvidenceRelativePath,
  validateGoLiveEvidence,
} from "./go-live-evidence.mjs";

const releaseId = "a".repeat(40);
const now = new Date("2026-09-14T08:30:00.000Z");

function validEvidence() {
  return {
    schemaVersion: 1,
    releaseId,
    decision: "GO",
    recordedAt: "2026-09-14T08:00:00.000Z",
    productionOrigin: "https://tickets.company.test",
    changeWindow: {
      startsAt: "2026-09-14T09:00:00.000Z",
      endsAt: "2026-09-14T10:00:00.000Z",
    },
    artifacts: {
      runnerDigest: `sha256:${"1".repeat(64)}`,
      migratorDigest: `sha256:${"2".repeat(64)}`,
      previousRunnerDigest: `sha256:${"3".repeat(64)}`,
      applicationSbom: "https://evidence.company.test/artifacts/application-sbom",
      migratorSbom: "https://evidence.company.test/artifacts/migrator-sbom",
      vulnerabilityScan: "https://evidence.company.test/security/vulnerability-scan",
    },
    staging: {
      releaseId,
      rehearsalReport: "https://evidence.company.test/staging/rehearsal",
      completedAt: "2026-09-14T07:30:00.000Z",
    },
    recoveryObjectives: { rpoMinutes: 15, rtoMinutes: 30 },
    gates: Object.entries(REQUIRED_GO_LIVE_GATES).map(([id, role]) => ({
      id,
      status: "PASS",
      evidence: [`https://evidence.company.test/gates/${id}`],
      owner: {
        name: `${role} approver`,
        role,
        approvedAt: "2026-09-14T07:45:00.000Z",
      },
    })),
  };
}

test("accepts a complete Go-Live evidence package", () => {
  const evidence = validEvidence();
  assert.deepEqual(validateGoLiveEvidence(evidence, { expectedReleaseId: releaseId, now }), []);
  const report = createGoLiveReadinessReport(evidence, { expectedReleaseId: releaseId, now });
  assert.equal(report.ok, true);
  assert.deepEqual(report.gateSummary, { required: 12, supplied: 12, passed: 12 });
});

test("rejects missing, duplicate, and failed gates", () => {
  const evidence = validEvidence();
  evidence.gates.pop();
  evidence.gates.push({ ...evidence.gates[0], status: "FAIL" });
  const errors = validateGoLiveEvidence(evidence, { expectedReleaseId: releaseId, now });
  assert.equal(errors.some((error) => error.includes("is duplicated")), true);
  assert.equal(errors.some((error) => error.includes("must have status PASS")), true);
  assert.equal(errors.some((error) => error.includes("Missing required Go-Live gate rollback")), true);
});

test("rejects release, rollback image, and staging mismatches", () => {
  const evidence = validEvidence();
  evidence.artifacts.previousRunnerDigest = evidence.artifacts.runnerDigest;
  evidence.staging.releaseId = "b".repeat(40);
  const errors = validateGoLiveEvidence(evidence, {
    expectedReleaseId: "c".repeat(40),
    now,
  });
  assert.equal(errors.some((error) => error.includes("EXPECTED_RELEASE_ID")), true);
  assert.equal(errors.some((error) => error.includes("previous rollback image")), true);
  assert.equal(errors.some((error) => error.includes("staging.releaseId")), true);
});

test("rejects secret-bearing fields and temporary evidence links", () => {
  const evidence = validEvidence();
  evidence.metricsToken = "must-not-be-recorded";
  evidence.gates[0].evidence = ["https://evidence.company.test/source?signature=sensitive"];
  const errors = validateGoLiveEvidence(evidence, { expectedReleaseId: releaseId, now });
  assert.equal(errors.some((error) => error.includes("forbidden secret-bearing field")), true);
  assert.equal(errors.some((error) => error.includes("without credentials, query, or fragment")), true);
});

test("rejects explicit placeholders without rejecting legitimate embedded words", () => {
  const placeholderEvidence = validEvidence();
  placeholderEvidence.gates[0].owner.name = "TODO: assign release owner";
  placeholderEvidence.gates[1].evidence = ["https://reports.example.com/artifact"];
  const errors = validateGoLiveEvidence(placeholderEvidence, {
    expectedReleaseId: releaseId,
    now,
  });
  assert.equal(errors.filter((error) => error.includes("placeholder value")).length, 2);

  const legitimateEvidence = validEvidence();
  legitimateEvidence.gates[0].owner.name = "Arman Pendington";
  assert.deepEqual(
    validateGoLiveEvidence(legitimateEvidence, { expectedReleaseId: releaseId, now }),
    []
  );
});

test("rejects a stale or unapproved production decision", () => {
  const evidence = validEvidence();
  evidence.decision = "NO_GO";
  evidence.changeWindow.startsAt = "2026-09-12T09:00:00.000Z";
  evidence.changeWindow.endsAt = "2026-09-12T10:00:00.000Z";
  const errors = validateGoLiveEvidence(evidence, { expectedReleaseId: releaseId, now });
  assert.equal(errors.some((error) => error === "decision must be GO"), true);
  assert.equal(errors.some((error) => error === "changeWindow is stale"), true);
});

test("confines evidence to the release-specific repository path", () => {
  const expected = `release-evidence/${releaseId}.json`;
  assert.equal(resolveEvidenceRelativePath(expected, releaseId), expected);
  assert.equal(resolveEvidenceRelativePath(expected.replaceAll("/", "\\"), releaseId), expected);
  assert.throws(
    () => resolveEvidenceRelativePath(`../${releaseId}.json`, releaseId),
    /GO_LIVE_EVIDENCE_PATH/
  );
  assert.throws(
    () => resolveEvidenceRelativePath(expected, "main"),
    /full lowercase 40-character Git commit SHA/
  );
});
