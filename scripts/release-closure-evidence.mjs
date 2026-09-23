const RELEASE_ID_PATTERN = /^[a-f0-9]{40}$/;
const SENSITIVE_KEY_PATTERN = /(?:secret|token|password|credential|private.?key|access.?key)/i;
const PLACEHOLDER_PATTERN = /^(?:example|replace(?:[-_ ]?me)?|placeholder|todo|tbd|pending)(?:[-_ :].*)?$/i;
const EXAMPLE_HOST_PATTERN = /^(?:.+\.)?example\.(?:com|net|org|invalid)$/i;
const MINIMUM_HYPERCARE_MS = 24 * 60 * 60 * 1000;
const MAXIMUM_HYPERCARE_MS = 7 * 24 * 60 * 60 * 1000;
const MAXIMUM_RECORDING_DELAY_MS = 24 * 60 * 60 * 1000;

export const REQUIRED_CLOSURE_CHECKPOINTS = Object.freeze([
  "initial",
  "midpoint",
  "closure",
]);

export const REQUIRED_CLOSURE_APPROVALS = Object.freeze([
  "On-call Owner",
  "Service Owner",
  "Release Owner",
]);

const TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion",
  "releaseId",
  "goLiveEvidenceRevision",
  "decision",
  "deployedAt",
  "hypercareStartedAt",
  "hypercareEndedAt",
  "recordedAt",
  "checkpoints",
  "operationalReview",
  "records",
  "approvals",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, field, errors) {
  if (!isObject(value)) {
    errors.push(`${field} must be an object`);
    return null;
  }
  return value;
}

function rejectUnknownKeys(value, allowedKeys, field, errors) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) errors.push(`${field} contains unsupported field ${key}`);
  }
}

function isPlaceholder(value) {
  if (PLACEHOLDER_PATTERN.test(value)) return true;
  try {
    return EXAMPLE_HOST_PATTERN.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

function requireString(value, field, errors) {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${field} must be a non-empty string`);
    return null;
  }
  const normalized = value.trim();
  if (isPlaceholder(normalized)) errors.push(`${field} contains a placeholder value`);
  return normalized;
}

function requireTimestamp(value, field, errors) {
  const normalized = requireString(value, field, errors);
  if (!normalized) return null;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== normalized) {
    errors.push(`${field} must be an ISO-8601 UTC timestamp`);
    return null;
  }
  return timestamp;
}

function validatePermanentHttpsReference(value, field, errors) {
  const normalized = requireString(value, field, errors);
  if (!normalized) return;
  let url;
  try {
    url = new URL(normalized);
  } catch {
    errors.push(`${field} must be a valid HTTPS URL`);
    return;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    errors.push(
      `${field} must be a permanent HTTPS URL without credentials, query, or fragment`
    );
  }
}

function findSensitiveFields(value, field, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSensitiveFields(item, `${field}[${index}]`, errors));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      errors.push(`${field}.${key} is a forbidden secret-bearing field`);
    }
    findSensitiveFields(child, `${field}.${key}`, errors);
  }
}

function validateReleaseIdentity(value, field, expectedValue, errors) {
  const revision = requireString(value, field, errors);
  if (revision && !RELEASE_ID_PATTERN.test(revision)) {
    errors.push(`${field} must be a full lowercase 40-character Git commit SHA`);
  }
  if (expectedValue && revision !== expectedValue) {
    errors.push(`${field} does not match its expected immutable revision`);
  }
  return revision;
}

function validateTimeline(evidence, now, errors) {
  const deployedAt = requireTimestamp(evidence.deployedAt, "deployedAt", errors);
  const startedAt = requireTimestamp(
    evidence.hypercareStartedAt,
    "hypercareStartedAt",
    errors
  );
  const endedAt = requireTimestamp(evidence.hypercareEndedAt, "hypercareEndedAt", errors);
  const recordedAt = requireTimestamp(evidence.recordedAt, "recordedAt", errors);

  if (deployedAt !== null && startedAt !== null && startedAt < deployedAt) {
    errors.push("hypercareStartedAt cannot be earlier than deployedAt");
  }
  if (startedAt !== null && endedAt !== null) {
    const duration = endedAt - startedAt;
    if (duration < MINIMUM_HYPERCARE_MS) {
      errors.push("Hypercare must last at least 24 hours");
    }
    if (duration > MAXIMUM_HYPERCARE_MS) {
      errors.push("Hypercare must not exceed 7 days in one closure record");
    }
  }
  if (endedAt !== null && recordedAt !== null) {
    if (recordedAt < endedAt) errors.push("recordedAt cannot be earlier than hypercareEndedAt");
    if (recordedAt - endedAt > MAXIMUM_RECORDING_DELAY_MS) {
      errors.push("Closure evidence must be recorded within 24 hours of Hypercare completion");
    }
  }
  if (recordedAt !== null && recordedAt > now.getTime()) {
    errors.push("recordedAt cannot be in the future");
  }

  return { endedAt, recordedAt, startedAt };
}

function validateCheckpoints(value, timeline, errors) {
  if (!Array.isArray(value)) {
    errors.push("checkpoints must be an array");
    return;
  }
  const seen = new Set();
  const completedByName = new Map();

  value.forEach((checkpointValue, index) => {
    const field = `checkpoints[${index}]`;
    const checkpoint = requireObject(checkpointValue, field, errors);
    if (!checkpoint) return;
    rejectUnknownKeys(checkpoint, ["name", "status", "report", "completedAt"], field, errors);
    const name = requireString(checkpoint.name, `${field}.name`, errors);
    if (!name) return;
    if (!REQUIRED_CLOSURE_CHECKPOINTS.includes(name)) {
      errors.push(`${field}.name is not a recognized Hypercare checkpoint`);
      return;
    }
    if (seen.has(name)) errors.push(`Hypercare checkpoint ${name} is duplicated`);
    seen.add(name);
    if (checkpoint.status !== "OBSERVATION_PASS") {
      errors.push(`Hypercare checkpoint ${name} must have status OBSERVATION_PASS`);
    }
    validatePermanentHttpsReference(checkpoint.report, `${field}.report`, errors);
    const completedAt = requireTimestamp(checkpoint.completedAt, `${field}.completedAt`, errors);
    if (completedAt !== null) completedByName.set(name, completedAt);
    if (
      completedAt !== null &&
      timeline.startedAt !== null &&
      completedAt < timeline.startedAt
    ) {
      errors.push(`Hypercare checkpoint ${name} cannot precede hypercareStartedAt`);
    }
    if (
      completedAt !== null &&
      timeline.endedAt !== null &&
      completedAt > timeline.endedAt
    ) {
      errors.push(`Hypercare checkpoint ${name} cannot follow hypercareEndedAt`);
    }
  });

  for (const name of REQUIRED_CLOSURE_CHECKPOINTS) {
    if (!seen.has(name)) errors.push(`Missing required Hypercare checkpoint ${name}`);
  }
  const orderedTimes = REQUIRED_CLOSURE_CHECKPOINTS.map((name) => completedByName.get(name));
  if (
    orderedTimes.every((timestamp) => timestamp !== undefined) &&
    !(orderedTimes[0] < orderedTimes[1] && orderedTimes[1] < orderedTimes[2])
  ) {
    errors.push("Hypercare checkpoints must complete in initial, midpoint, closure order");
  }
}

function validateOperationalReview(value, errors) {
  const review = requireObject(value, "operationalReview", errors);
  if (!review) return;
  const zeroRiskFields = [
    "openSev1",
    "openSev2",
    "unresolvedSecurityIncidents",
    "unresolvedDataIntegrityIncidents",
    "unresolvedCustomerImpact",
    "unresolvedSlaRegressions",
  ];
  const booleanFields = ["alertsStable", "backlogWithinCapacity"];
  rejectUnknownKeys(review, [...zeroRiskFields, ...booleanFields, "rollbackTriggered"], "operationalReview", errors);

  for (const field of zeroRiskFields) {
    if (review[field] !== 0) errors.push(`operationalReview.${field} must be 0`);
  }
  for (const field of booleanFields) {
    if (review[field] !== true) errors.push(`operationalReview.${field} must be true`);
  }
  if (review.rollbackTriggered !== false) {
    errors.push("operationalReview.rollbackTriggered must be false");
  }
}

function validateRecords(value, errors) {
  const records = requireObject(value, "records", errors);
  if (!records) return;
  const fields = [
    "changeRecord",
    "incidentReview",
    "monitoringReview",
    "customerImpactReview",
  ];
  rejectUnknownKeys(records, fields, "records", errors);
  for (const field of fields) {
    validatePermanentHttpsReference(records[field], `records.${field}`, errors);
  }
}

function validateApprovals(value, timeline, errors) {
  if (!Array.isArray(value)) {
    errors.push("approvals must be an array");
    return;
  }
  const seen = new Set();
  value.forEach((approvalValue, index) => {
    const field = `approvals[${index}]`;
    const approval = requireObject(approvalValue, field, errors);
    if (!approval) return;
    rejectUnknownKeys(approval, ["role", "name", "approvedAt", "evidence"], field, errors);
    const role = requireString(approval.role, `${field}.role`, errors);
    if (!role) return;
    if (!REQUIRED_CLOSURE_APPROVALS.includes(role)) {
      errors.push(`${field}.role is not authorized to close a release`);
      return;
    }
    if (seen.has(role)) errors.push(`Release closure approval ${role} is duplicated`);
    seen.add(role);
    requireString(approval.name, `${field}.name`, errors);
    validatePermanentHttpsReference(approval.evidence, `${field}.evidence`, errors);
    const approvedAt = requireTimestamp(approval.approvedAt, `${field}.approvedAt`, errors);
    if (approvedAt !== null && timeline.endedAt !== null && approvedAt <= timeline.endedAt) {
      errors.push(`${role} approval cannot precede hypercareEndedAt`);
    }
    if (approvedAt !== null && timeline.recordedAt !== null && approvedAt > timeline.recordedAt) {
      errors.push(`${role} approval cannot follow recordedAt`);
    }
  });
  for (const role of REQUIRED_CLOSURE_APPROVALS) {
    if (!seen.has(role)) errors.push(`Missing required release closure approval ${role}`);
  }
}

export function resolveClosureEvidenceRelativePath(relativePath, expectedReleaseId) {
  if (!RELEASE_ID_PATTERN.test(expectedReleaseId)) {
    throw new Error("EXPECTED_RELEASE_ID must be the full lowercase 40-character Git commit SHA");
  }
  const normalized = relativePath.replaceAll("\\", "/");
  const expectedPath = `release-closure/${expectedReleaseId}.json`;
  if (normalized !== expectedPath) {
    throw new Error(`RELEASE_CLOSURE_EVIDENCE_PATH must be ${expectedPath}`);
  }
  return expectedPath;
}

export function validateReleaseClosureEvidence(
  document,
  {
    expectedReleaseId,
    expectedGoLiveEvidenceRevision,
    now = new Date(),
  } = {}
) {
  const errors = [];
  const evidence = requireObject(document, "evidence", errors);
  if (!evidence) return errors;
  findSensitiveFields(evidence, "evidence", errors);
  rejectUnknownKeys(evidence, TOP_LEVEL_KEYS, "evidence", errors);
  if (evidence.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  const releaseId = validateReleaseIdentity(
    evidence.releaseId,
    "releaseId",
    expectedReleaseId,
    errors
  );
  const goLiveEvidenceRevision = validateReleaseIdentity(
    evidence.goLiveEvidenceRevision,
    "goLiveEvidenceRevision",
    expectedGoLiveEvidenceRevision,
    errors
  );
  if (releaseId && goLiveEvidenceRevision && releaseId === goLiveEvidenceRevision) {
    errors.push("goLiveEvidenceRevision must be a commit after the application release");
  }
  if (evidence.decision !== "CLOSE") errors.push("decision must be CLOSE");
  const timeline = validateTimeline(evidence, now, errors);
  validateCheckpoints(evidence.checkpoints, timeline, errors);
  validateOperationalReview(evidence.operationalReview, errors);
  validateRecords(evidence.records, errors);
  validateApprovals(evidence.approvals, timeline, errors);
  return errors;
}

export function createReleaseClosureReport(document, options = {}) {
  const now = options.now ?? new Date();
  const errors = validateReleaseClosureEvidence(document, { ...options, now });
  const checkpoints = Array.isArray(document?.checkpoints) ? document.checkpoints : [];
  const approvals = Array.isArray(document?.approvals) ? document.approvals : [];
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    releaseId: RELEASE_ID_PATTERN.test(document?.releaseId) ? document.releaseId : null,
    decision: errors.length === 0 ? "CLOSE" : "KEEP_OPEN",
    ok: errors.length === 0,
    checkpointSummary: {
      required: REQUIRED_CLOSURE_CHECKPOINTS.length,
      supplied: checkpoints.length,
      passed: checkpoints.filter((item) => item?.status === "OBSERVATION_PASS").length,
    },
    approvalSummary: {
      required: REQUIRED_CLOSURE_APPROVALS.length,
      supplied: approvals.length,
    },
    errors,
  };
}
