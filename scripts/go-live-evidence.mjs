const RELEASE_ID_PATTERN = /^[a-f0-9]{40}$/;
const IMAGE_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const PLACEHOLDER_PATTERN = /^(?:example|replace(?:[-_ ]?me)?|placeholder|todo|tbd|pending)(?:[-_ :].*)?$/i;
const EXAMPLE_HOST_PATTERN = /^(?:.+\.)?example\.(?:com|net|org|invalid)$/i;
const SENSITIVE_KEY_PATTERN = /(?:secret|token|password|credential|private.?key|access.?key)/i;

export const REQUIRED_GO_LIVE_GATES = Object.freeze({
  source: "Release Owner",
  artifact: "Release Owner",
  secrets: "Security Owner",
  database: "Database Owner",
  storage: "Infrastructure Owner",
  malwareScan: "Security Owner",
  network: "Infrastructure Owner",
  authorization: "Security Owner",
  lifecycle: "Operations Owner",
  observability: "On-call Owner",
  capacity: "Service Owner",
  rollback: "Release Owner",
});

export function resolveEvidenceRelativePath(relativePath, expectedReleaseId) {
  if (!RELEASE_ID_PATTERN.test(expectedReleaseId)) {
    throw new Error("EXPECTED_RELEASE_ID must be the full lowercase 40-character Git commit SHA");
  }
  const normalized = relativePath.replaceAll("\\", "/");
  const expectedPath = `release-evidence/${expectedReleaseId}.json`;
  if (normalized !== expectedPath) {
    throw new Error(`GO_LIVE_EVIDENCE_PATH must be ${expectedPath}`);
  }
  return expectedPath;
}

const TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion",
  "releaseId",
  "decision",
  "recordedAt",
  "productionOrigin",
  "changeWindow",
  "artifacts",
  "staging",
  "recoveryObjectives",
  "gates",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknownKeys(value, allowedKeys, field, errors) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) errors.push(`${field} contains unsupported field ${key}`);
  }
}

function requireObject(value, field, errors) {
  if (!isObject(value)) {
    errors.push(`${field} must be an object`);
    return null;
  }
  return value;
}

function requireString(value, field, errors) {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${field} must be a non-empty string`);
    return null;
  }
  const normalized = value.trim();
  let isPlaceholder = PLACEHOLDER_PATTERN.test(normalized);
  try {
    isPlaceholder ||= EXAMPLE_HOST_PATTERN.test(new URL(normalized).hostname);
  } catch {
    // Most validated strings are not URLs; their placeholder token is checked above.
  }
  if (isPlaceholder) errors.push(`${field} contains a placeholder value`);
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

function requirePositiveInteger(value, field, errors) {
  if (!Number.isInteger(value) || value <= 0) {
    errors.push(`${field} must be a positive integer`);
    return null;
  }
  return value;
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
    errors.push(`${field} must be a permanent HTTPS URL without credentials, query, or fragment`);
  }
}

function validateProductionOrigin(value, errors) {
  const normalized = requireString(value, "productionOrigin", errors);
  if (!normalized) return;
  let url;
  try {
    url = new URL(normalized);
  } catch {
    errors.push("productionOrigin must be a valid HTTPS origin");
    return;
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== normalized ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    errors.push("productionOrigin must be an exact HTTPS origin without credentials or path");
  }
}

function findSensitiveFields(value, path, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSensitiveFields(item, `${path}[${index}]`, errors));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) errors.push(`${path}.${key} is a forbidden secret-bearing field`);
    findSensitiveFields(child, `${path}.${key}`, errors);
  }
}

function validateArtifacts(value, errors) {
  const artifacts = requireObject(value, "artifacts", errors);
  if (!artifacts) return;
  const keys = [
    "runnerDigest",
    "migratorDigest",
    "previousRunnerDigest",
    "applicationSbom",
    "migratorSbom",
    "vulnerabilityScan",
  ];
  rejectUnknownKeys(artifacts, keys, "artifacts", errors);
  for (const key of ["runnerDigest", "migratorDigest", "previousRunnerDigest"]) {
    const digest = requireString(artifacts[key], `artifacts.${key}`, errors);
    if (digest && !IMAGE_DIGEST_PATTERN.test(digest)) {
      errors.push(`artifacts.${key} must be a lowercase sha256 image digest`);
    }
  }
  if (
    artifacts.runnerDigest &&
    artifacts.previousRunnerDigest &&
    artifacts.runnerDigest === artifacts.previousRunnerDigest
  ) {
    errors.push("artifacts.previousRunnerDigest must identify the previous rollback image");
  }
  for (const key of ["applicationSbom", "migratorSbom", "vulnerabilityScan"]) {
    validatePermanentHttpsReference(artifacts[key], `artifacts.${key}`, errors);
  }
}

function validateStaging(value, releaseId, errors) {
  const staging = requireObject(value, "staging", errors);
  if (!staging) return null;
  rejectUnknownKeys(
    staging,
    ["releaseId", "rehearsalReport", "completedAt"],
    "staging",
    errors
  );
  const stagingReleaseId = requireString(staging.releaseId, "staging.releaseId", errors);
  if (stagingReleaseId && stagingReleaseId !== releaseId) {
    errors.push("staging.releaseId must match releaseId");
  }
  validatePermanentHttpsReference(staging.rehearsalReport, "staging.rehearsalReport", errors);
  return requireTimestamp(staging.completedAt, "staging.completedAt", errors);
}

function validateChangeWindow(value, recordedAt, now, errors) {
  const changeWindow = requireObject(value, "changeWindow", errors);
  if (!changeWindow) return;
  rejectUnknownKeys(changeWindow, ["startsAt", "endsAt"], "changeWindow", errors);
  const startsAt = requireTimestamp(changeWindow.startsAt, "changeWindow.startsAt", errors);
  const endsAt = requireTimestamp(changeWindow.endsAt, "changeWindow.endsAt", errors);
  if (startsAt === null || endsAt === null) return;
  if (endsAt <= startsAt) errors.push("changeWindow.endsAt must be after startsAt");
  if (endsAt - startsAt > 24 * 60 * 60 * 1000) {
    errors.push("changeWindow must not exceed 24 hours");
  }
  if (recordedAt !== null && recordedAt > startsAt) {
    errors.push("recordedAt must be at or before changeWindow.startsAt");
  }
  if (startsAt < now.getTime() - 24 * 60 * 60 * 1000) {
    errors.push("changeWindow is stale");
  }
}

function validateRecoveryObjectives(value, errors) {
  const objectives = requireObject(value, "recoveryObjectives", errors);
  if (!objectives) return;
  rejectUnknownKeys(objectives, ["rpoMinutes", "rtoMinutes"], "recoveryObjectives", errors);
  requirePositiveInteger(objectives.rpoMinutes, "recoveryObjectives.rpoMinutes", errors);
  requirePositiveInteger(objectives.rtoMinutes, "recoveryObjectives.rtoMinutes", errors);
}

function validateGates(value, recordedAt, errors) {
  if (!Array.isArray(value)) {
    errors.push("gates must be an array");
    return;
  }
  const seen = new Set();
  for (const [index, gateValue] of value.entries()) {
    const field = `gates[${index}]`;
    const gate = requireObject(gateValue, field, errors);
    if (!gate) continue;
    rejectUnknownKeys(gate, ["id", "status", "evidence", "owner"], field, errors);
    const id = requireString(gate.id, `${field}.id`, errors);
    if (!id) continue;
    if (!(id in REQUIRED_GO_LIVE_GATES)) {
      errors.push(`${field}.id is not a recognized Go-Live gate`);
      continue;
    }
    if (seen.has(id)) errors.push(`Go-Live gate ${id} is duplicated`);
    seen.add(id);
    if (gate.status !== "PASS") errors.push(`Go-Live gate ${id} must have status PASS`);
    if (!Array.isArray(gate.evidence) || gate.evidence.length === 0) {
      errors.push(`Go-Live gate ${id} must include at least one evidence reference`);
    } else {
      gate.evidence.forEach((reference, evidenceIndex) =>
        validatePermanentHttpsReference(
          reference,
          `${field}.evidence[${evidenceIndex}]`,
          errors
        )
      );
    }
    const owner = requireObject(gate.owner, `${field}.owner`, errors);
    if (!owner) continue;
    rejectUnknownKeys(owner, ["name", "role", "approvedAt"], `${field}.owner`, errors);
    requireString(owner.name, `${field}.owner.name`, errors);
    const role = requireString(owner.role, `${field}.owner.role`, errors);
    if (role && role !== REQUIRED_GO_LIVE_GATES[id]) {
      errors.push(`Go-Live gate ${id} must be approved by ${REQUIRED_GO_LIVE_GATES[id]}`);
    }
    const approvedAt = requireTimestamp(owner.approvedAt, `${field}.owner.approvedAt`, errors);
    if (approvedAt !== null && recordedAt !== null && approvedAt > recordedAt) {
      errors.push(`Go-Live gate ${id} approval cannot be later than recordedAt`);
    }
  }
  for (const id of Object.keys(REQUIRED_GO_LIVE_GATES)) {
    if (!seen.has(id)) errors.push(`Missing required Go-Live gate ${id}`);
  }
}

export function validateGoLiveEvidence(
  document,
  { expectedReleaseId, now = new Date() } = {}
) {
  const errors = [];
  const evidence = requireObject(document, "evidence", errors);
  if (!evidence) return errors;
  findSensitiveFields(evidence, "evidence", errors);
  rejectUnknownKeys(evidence, TOP_LEVEL_KEYS, "evidence", errors);
  if (evidence.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  const releaseId = requireString(evidence.releaseId, "releaseId", errors);
  if (releaseId && !RELEASE_ID_PATTERN.test(releaseId)) {
    errors.push("releaseId must be the full lowercase 40-character Git commit SHA");
  }
  if (expectedReleaseId && releaseId !== expectedReleaseId) {
    errors.push("releaseId does not match EXPECTED_RELEASE_ID");
  }
  if (evidence.decision !== "GO") errors.push("decision must be GO");
  const recordedAt = requireTimestamp(evidence.recordedAt, "recordedAt", errors);
  if (recordedAt !== null && recordedAt > now.getTime()) {
    errors.push("recordedAt cannot be in the future");
  }
  validateProductionOrigin(evidence.productionOrigin, errors);
  validateChangeWindow(evidence.changeWindow, recordedAt, now, errors);
  validateArtifacts(evidence.artifacts, errors);
  const stagingCompletedAt = validateStaging(evidence.staging, releaseId, errors);
  if (
    stagingCompletedAt !== null &&
    recordedAt !== null &&
    stagingCompletedAt > recordedAt
  ) {
    errors.push("staging.completedAt cannot be later than recordedAt");
  }
  validateRecoveryObjectives(evidence.recoveryObjectives, errors);
  validateGates(evidence.gates, recordedAt, errors);
  return errors;
}

export function createGoLiveReadinessReport(
  document,
  options = {}
) {
  const now = options.now ?? new Date();
  const errors = validateGoLiveEvidence(document, { ...options, now });
  const gates = Array.isArray(document?.gates) ? document.gates : [];
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    releaseId: RELEASE_ID_PATTERN.test(document?.releaseId) ? document.releaseId : null,
    decision: document?.decision === "GO" ? "GO" : "NO_GO",
    ok: errors.length === 0,
    gateSummary: {
      required: Object.keys(REQUIRED_GO_LIVE_GATES).length,
      supplied: gates.length,
      passed: gates.filter((gate) => gate?.status === "PASS").length,
    },
    errors,
  };
}
