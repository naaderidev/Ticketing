import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createLegacyRetirementReport,
  REQUIRED_LEGACY_SURFACES,
  REQUIRED_RETIREMENT_APPROVALS,
  REQUIRED_RETIREMENT_FEATURE_FLAGS,
  resolveRetirementEvidenceRelativePath,
  validateLegacyRetirementEvidence,
} from "./legacy-retirement-evidence.mjs";

const releaseId = "a".repeat(40);
const closureRevision = "c".repeat(40);
const now = new Date("2026-08-31T02:00:00.000Z");

function validRetirementEvidence() {
  return {
    schemaVersion: 1,
    releaseId,
    closureRevision,
    decision: "RETIRE_LEGACY",
    observationWindow: {
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-08-31T00:00:00.000Z",
    },
    recordedAt: "2026-08-31T01:00:00.000Z",
    featureFlags: REQUIRED_RETIREMENT_FEATURE_FLAGS.map((name) => ({
      name,
      status: "ENABLED",
      enabledAt: "2026-07-31T00:00:00.000Z",
      evidence: `https://evidence.company.test/flags/${name.toLowerCase()}`,
    })),
    legacyTraffic: {
      authenticatedRequests: 0,
      successfulWrites: 0,
      knownConsumers: 0,
      unsupportedClients: 0,
    },
    dataReconciliation: {
      pendingLegacyCatalogMappings: 0,
      unreconciledLegacyTickets: 0,
      legacyPublicAttachments: 0,
      orphanedAttachmentObjects: 0,
      outboxDeadLetters: 0,
    },
    legacySurfaces: REQUIRED_LEGACY_SURFACES.map((id) => ({
      id,
      status: "READY_TO_RETIRE",
      owner: `${id} owner`,
      evidence: `https://evidence.company.test/surfaces/${id}`,
      removalPlan: `https://evidence.company.test/removal-plans/${id}`,
    })),
    records: {
      consumerInventory: "https://evidence.company.test/consumers/inventory",
      trafficAnalysis: "https://evidence.company.test/traffic/legacy",
      dataRetentionPlan: "https://evidence.company.test/data/retention",
      rollbackExpiryApproval: "https://evidence.company.test/rollback/expiry",
    },
    approvals: REQUIRED_RETIREMENT_APPROVALS.map((role) => ({
      role,
      name: `${role} approver`,
      approvedAt: "2026-08-31T00:30:00.000Z",
      evidence: `https://evidence.company.test/approvals/${role.toLowerCase().replaceAll(" ", "-")}`,
    })),
  };
}

function options() {
  return { expectedClosureRevision: closureRevision, expectedReleaseId: releaseId, now };
}

test("accepts complete Legacy retirement evidence", () => {
  const evidence = validRetirementEvidence();
  assert.deepEqual(validateLegacyRetirementEvidence(evidence, options()), []);
  const report = createLegacyRetirementReport(evidence, options());
  assert.equal(report.ok, true);
  assert.equal(report.decision, "READY_TO_RETIRE");
  assert.deepEqual(report.summary, {
    requiredFeatureFlags: 8,
    suppliedFeatureFlags: 8,
    requiredLegacySurfaces: 6,
    suppliedLegacySurfaces: 6,
    requiredApprovals: 5,
    suppliedApprovals: 5,
  });
});

test("enforces immutable revisions and a 30-day observation window", () => {
  const evidence = validRetirementEvidence();
  evidence.releaseId = "b".repeat(40);
  evidence.closureRevision = "d".repeat(40);
  evidence.observationWindow.endsAt = "2026-08-20T00:00:00.000Z";
  const errors = validateLegacyRetirementEvidence(evidence, options());
  assert.equal(errors.some((error) => error.includes("releaseId does not match")), true);
  assert.equal(errors.some((error) => error.includes("closureRevision does not match")), true);
  assert.equal(errors.some((error) => error.includes("at least 30 days")), true);
});

test("requires every v2 feature flag to remain enabled before observation", () => {
  const evidence = validRetirementEvidence();
  evidence.featureFlags.pop();
  evidence.featureFlags.push({
    ...evidence.featureFlags[0],
    status: "DISABLED",
    enabledAt: "2026-08-02T00:00:00.000Z",
  });
  const errors = validateLegacyRetirementEvidence(evidence, options());
  assert.equal(errors.some((error) => error.includes("is duplicated")), true);
  assert.equal(errors.some((error) => error.includes("must have status ENABLED")), true);
  assert.equal(errors.some((error) => error.includes("before observation starts")), true);
  assert.equal(
    errors.some((error) => error.includes("FEATURE_CUSTOMER_EXPERIENCE_V2_ENABLED")),
    true
  );
});

test("keeps Legacy while traffic or reconciliation work remains", () => {
  const evidence = validRetirementEvidence();
  evidence.legacyTraffic.successfulWrites = 1;
  evidence.dataReconciliation.legacyPublicAttachments = 2;
  const report = createLegacyRetirementReport(evidence, options());
  assert.equal(report.ok, false);
  assert.equal(report.decision, "KEEP_LEGACY");
  assert.equal(report.errors.some((error) => error.includes("successfulWrites must be 0")), true);
  assert.equal(
    report.errors.some((error) => error.includes("legacyPublicAttachments must be 0")),
    true
  );
});

test("requires every Legacy surface and an explicit removal plan", () => {
  const evidence = validRetirementEvidence();
  evidence.legacySurfaces.pop();
  evidence.legacySurfaces[0].status = "IN_USE";
  evidence.legacySurfaces[1].removalPlan = "TODO";
  const errors = validateLegacyRetirementEvidence(evidence, options());
  assert.equal(errors.some((error) => error.includes("must have status READY_TO_RETIRE")), true);
  assert.equal(errors.some((error) => error.includes("placeholder value")), true);
  assert.equal(
    errors.some((error) => error.includes("Missing required Legacy surface legacy-ticket-reconciliation")),
    true
  );
});

test("rejects unsafe records, secret fields, and incomplete approvals", () => {
  const evidence = validRetirementEvidence();
  evidence.accessToken = "must-not-be-recorded";
  evidence.records.trafficAnalysis = "https://evidence.company.test/traffic?signature=temporary";
  evidence.approvals.pop();
  const errors = validateLegacyRetirementEvidence(evidence, options());
  assert.equal(errors.some((error) => error.includes("forbidden secret-bearing field")), true);
  assert.equal(errors.some((error) => error.includes("without credentials, query, or fragment")), true);
  assert.equal(
    errors.some((error) => error.includes("Missing required Legacy retirement approval Service Owner")),
    true
  );
});

test("confines retirement evidence to the release-specific repository path", () => {
  const expected = `legacy-retirement/${releaseId}.json`;
  assert.equal(resolveRetirementEvidenceRelativePath(expected, releaseId), expected);
  assert.equal(resolveRetirementEvidenceRelativePath(expected.replaceAll("/", "\\"), releaseId), expected);
  assert.throws(
    () => resolveRetirementEvidenceRelativePath(`../${releaseId}.json`, releaseId),
    /LEGACY_RETIREMENT_EVIDENCE_PATH/
  );
  assert.throws(
    () => resolveRetirementEvidenceRelativePath(expected, "main"),
    /full lowercase 40-character Git commit SHA/
  );
});
