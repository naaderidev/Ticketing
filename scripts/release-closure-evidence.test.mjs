import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createReleaseClosureReport,
  REQUIRED_CLOSURE_APPROVALS,
  REQUIRED_CLOSURE_CHECKPOINTS,
  resolveClosureEvidenceRelativePath,
  validateReleaseClosureEvidence,
} from "./release-closure-evidence.mjs";

const releaseId = "a".repeat(40);
const goLiveEvidenceRevision = "b".repeat(40);
const now = new Date("2026-09-13T07:00:00.000Z");

function validClosureEvidence() {
  return {
    schemaVersion: 1,
    releaseId,
    goLiveEvidenceRevision,
    decision: "CLOSE",
    deployedAt: "2026-09-12T05:45:00.000Z",
    hypercareStartedAt: "2026-09-12T06:00:00.000Z",
    hypercareEndedAt: "2026-09-13T06:00:00.000Z",
    recordedAt: "2026-09-13T06:30:00.000Z",
    checkpoints: [
      {
        name: "initial",
        status: "OBSERVATION_PASS",
        report: "https://evidence.company.test/production/initial",
        completedAt: "2026-09-12T06:10:00.000Z",
      },
      {
        name: "midpoint",
        status: "OBSERVATION_PASS",
        report: "https://evidence.company.test/production/midpoint",
        completedAt: "2026-09-12T18:00:00.000Z",
      },
      {
        name: "closure",
        status: "OBSERVATION_PASS",
        report: "https://evidence.company.test/production/closure",
        completedAt: "2026-09-13T06:00:00.000Z",
      },
    ],
    operationalReview: {
      openSev1: 0,
      openSev2: 0,
      unresolvedSecurityIncidents: 0,
      unresolvedDataIntegrityIncidents: 0,
      unresolvedCustomerImpact: 0,
      unresolvedSlaRegressions: 0,
      alertsStable: true,
      backlogWithinCapacity: true,
      rollbackTriggered: false,
    },
    records: {
      changeRecord: "https://evidence.company.test/change/release",
      incidentReview: "https://evidence.company.test/incidents/review",
      monitoringReview: "https://evidence.company.test/monitoring/review",
      customerImpactReview: "https://evidence.company.test/customer-impact/review",
    },
    approvals: REQUIRED_CLOSURE_APPROVALS.map((role) => ({
      role,
      name: `${role} approver`,
      approvedAt: "2026-09-13T06:15:00.000Z",
      evidence: `https://evidence.company.test/approvals/${role.toLowerCase().replaceAll(" ", "-")}`,
    })),
  };
}

function validationOptions() {
  return {
    expectedReleaseId: releaseId,
    expectedGoLiveEvidenceRevision: goLiveEvidenceRevision,
    now,
  };
}

test("accepts a complete release closure evidence package", () => {
  const evidence = validClosureEvidence();
  assert.deepEqual(validateReleaseClosureEvidence(evidence, validationOptions()), []);
  const report = createReleaseClosureReport(evidence, validationOptions());
  assert.equal(report.ok, true);
  assert.equal(report.decision, "CLOSE");
  assert.deepEqual(report.checkpointSummary, { required: 3, supplied: 3, passed: 3 });
  assert.deepEqual(report.approvalSummary, { required: 3, supplied: 3 });
});

test("rejects missing, duplicate, failed, and out-of-order checkpoints", () => {
  const evidence = validClosureEvidence();
  evidence.checkpoints.pop();
  evidence.checkpoints.push({
    ...evidence.checkpoints[0],
    status: "ROLLBACK_REVIEW_REQUIRED",
    completedAt: "2026-09-12T19:00:00.000Z",
  });
  const errors = validateReleaseClosureEvidence(evidence, validationOptions());
  assert.equal(errors.some((error) => error.includes("is duplicated")), true);
  assert.equal(errors.some((error) => error.includes("must have status OBSERVATION_PASS")), true);
  assert.equal(errors.some((error) => error.includes("Missing required Hypercare checkpoint closure")), true);
});

test("enforces timeline order, duration, freshness, and immutable revisions", () => {
  const evidence = validClosureEvidence();
  evidence.releaseId = "c".repeat(40);
  evidence.goLiveEvidenceRevision = "d".repeat(40);
  evidence.hypercareEndedAt = "2026-09-12T12:00:00.000Z";
  evidence.recordedAt = "2026-09-13T12:30:00.000Z";
  const errors = validateReleaseClosureEvidence(evidence, validationOptions());
  assert.equal(errors.some((error) => error.includes("releaseId does not match")), true);
  assert.equal(errors.some((error) => error.includes("goLiveEvidenceRevision does not match")), true);
  assert.equal(errors.some((error) => error.includes("at least 24 hours")), true);
  assert.equal(errors.some((error) => error.includes("recordedAt cannot be in the future")), true);
});

test("requires a distinct post-release Go-Live evidence revision", () => {
  const evidence = validClosureEvidence();
  evidence.goLiveEvidenceRevision = releaseId;
  const errors = validateReleaseClosureEvidence(evidence, {
    ...validationOptions(),
    expectedGoLiveEvidenceRevision: releaseId,
  });
  assert.equal(
    errors.some((error) => error.includes("must be a commit after the application release")),
    true
  );
});

test("keeps a release open while any operational risk remains", () => {
  const evidence = validClosureEvidence();
  evidence.operationalReview.openSev1 = 1;
  evidence.operationalReview.alertsStable = false;
  evidence.operationalReview.rollbackTriggered = true;
  const report = createReleaseClosureReport(evidence, validationOptions());
  assert.equal(report.ok, false);
  assert.equal(report.decision, "KEEP_OPEN");
  assert.equal(report.errors.some((error) => error.includes("openSev1 must be 0")), true);
  assert.equal(report.errors.some((error) => error.includes("alertsStable must be true")), true);
  assert.equal(report.errors.some((error) => error.includes("rollbackTriggered must be false")), true);
});

test("requires unique post-Hypercare approvals from every owner role", () => {
  const evidence = validClosureEvidence();
  evidence.approvals.pop();
  evidence.approvals.push({
    ...evidence.approvals[0],
    approvedAt: "2026-09-12T10:00:00.000Z",
  });
  const errors = validateReleaseClosureEvidence(evidence, validationOptions());
  assert.equal(errors.some((error) => error.includes("approval On-call Owner is duplicated")), true);
  assert.equal(errors.some((error) => error.includes("cannot precede hypercareEndedAt")), true);
  assert.equal(errors.some((error) => error.includes("Missing required release closure approval Release Owner")), true);
});

test("rejects secret fields, temporary references, and placeholders", () => {
  const evidence = validClosureEvidence();
  evidence.metricsToken = "must-not-be-recorded";
  evidence.records.changeRecord = "https://evidence.company.test/change?id=temporary";
  evidence.approvals[0].name = "TODO: assign owner";
  const errors = validateReleaseClosureEvidence(evidence, validationOptions());
  assert.equal(errors.some((error) => error.includes("forbidden secret-bearing field")), true);
  assert.equal(errors.some((error) => error.includes("without credentials, query, or fragment")), true);
  assert.equal(errors.some((error) => error.includes("placeholder value")), true);
});

test("confines closure evidence to its release-specific repository path", () => {
  const expected = `release-closure/${releaseId}.json`;
  assert.equal(resolveClosureEvidenceRelativePath(expected, releaseId), expected);
  assert.equal(resolveClosureEvidenceRelativePath(expected.replaceAll("/", "\\"), releaseId), expected);
  assert.throws(
    () => resolveClosureEvidenceRelativePath(`../${releaseId}.json`, releaseId),
    /RELEASE_CLOSURE_EVIDENCE_PATH/
  );
  assert.throws(
    () => resolveClosureEvidenceRelativePath(expected, "main"),
    /full lowercase 40-character Git commit SHA/
  );
  assert.deepEqual(REQUIRED_CLOSURE_CHECKPOINTS, ["initial", "midpoint", "closure"]);
});
