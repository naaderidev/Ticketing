const SHA_PATTERN = /^[a-f0-9]{40}$/;
const SENSITIVE_KEY_PATTERN = /(?:secret|token|password|credential|private.?key|access.?key)/i;
const PLACEHOLDER_PATTERN = /^(?:example|replace(?:[-_ ]?me)?|placeholder|todo|tbd|pending)(?:[-_ :].*)?$/i;
const EXAMPLE_HOST_PATTERN = /^(?:.+\.)?example\.(?:com|net|org|invalid)$/i;
const MINIMUM_OBSERVATION_MS = 30 * 24 * 60 * 60 * 1000;
const MAXIMUM_OBSERVATION_MS = 180 * 24 * 60 * 60 * 1000;
const MAXIMUM_RECORDING_DELAY_MS = 24 * 60 * 60 * 1000;

export const REQUIRED_RETIREMENT_FEATURE_FLAGS = Object.freeze([
  "FEATURE_ORGANIZATION_CONTEXT_ENABLED",
  "FEATURE_SUPPORT_V2_READ_ENABLED",
  "FEATURE_SUPPORT_V2_WRITE_ENABLED",
  "FEATURE_AGENT_WORKSPACE_V2_ENABLED",
  "FEATURE_SLA_ENFORCEMENT_ENABLED",
  "FEATURE_OUTBOX_DISPATCH_ENABLED",
  "FEATURE_BUSINESS_REFERENCE_INTEGRATIONS_ENABLED",
  "FEATURE_CUSTOMER_EXPERIENCE_V2_ENABLED",
]);

export const REQUIRED_LEGACY_SURFACES = Object.freeze([
  "customer-ui-v1",
  "agent-ui-v1",
  "ticket-api-v1",
  "legacy-public-attachments",
  "legacy-catalog-mapping",
  "legacy-ticket-reconciliation",
]);

export const REQUIRED_RETIREMENT_APPROVALS = Object.freeze([
  "Product Owner",
  "Architecture Owner",
  "Database Owner",
  "Security Owner",
  "Service Owner",
]);

const TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion",
  "releaseId",
  "closureRevision",
  "decision",
  "observationWindow",
  "recordedAt",
  "featureFlags",
  "legacyTraffic",
  "dataReconciliation",
  "legacySurfaces",
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

function validateRevision(value, field, expectedValue, errors) {
  const revision = requireString(value, field, errors);
  if (revision && !SHA_PATTERN.test(revision)) {
    errors.push(`${field} must be a full lowercase 40-character Git commit SHA`);
  }
  if (expectedValue && revision !== expectedValue) {
    errors.push(`${field} does not match its expected immutable revision`);
  }
  return revision;
}

function validateObservationWindow(value, recordedAt, now, errors) {
  const window = requireObject(value, "observationWindow", errors);
  if (!window) return { endsAt: null, startsAt: null };
  rejectUnknownKeys(window, ["startsAt", "endsAt"], "observationWindow", errors);
  const startsAt = requireTimestamp(window.startsAt, "observationWindow.startsAt", errors);
  const endsAt = requireTimestamp(window.endsAt, "observationWindow.endsAt", errors);
  if (startsAt !== null && endsAt !== null) {
    const duration = endsAt - startsAt;
    if (duration < MINIMUM_OBSERVATION_MS) {
      errors.push("Legacy retirement observation must last at least 30 days");
    }
    if (duration > MAXIMUM_OBSERVATION_MS) {
      errors.push("Legacy retirement observation must not exceed 180 days");
    }
  }
  if (endsAt !== null && recordedAt !== null) {
    if (recordedAt < endsAt) errors.push("recordedAt cannot precede observationWindow.endsAt");
    if (recordedAt - endsAt > MAXIMUM_RECORDING_DELAY_MS) {
      errors.push("Retirement evidence must be recorded within 24 hours of observation completion");
    }
  }
  if (recordedAt !== null && recordedAt > now.getTime()) {
    errors.push("recordedAt cannot be in the future");
  }
  return { endsAt, startsAt };
}

function validateFeatureFlags(value, window, errors) {
  if (!Array.isArray(value)) {
    errors.push("featureFlags must be an array");
    return;
  }
  const seen = new Set();
  value.forEach((flagValue, index) => {
    const field = `featureFlags[${index}]`;
    const flag = requireObject(flagValue, field, errors);
    if (!flag) return;
    rejectUnknownKeys(flag, ["name", "status", "enabledAt", "evidence"], field, errors);
    const name = requireString(flag.name, `${field}.name`, errors);
    if (!name) return;
    if (!REQUIRED_RETIREMENT_FEATURE_FLAGS.includes(name)) {
      errors.push(`${field}.name is not a recognized retirement feature flag`);
      return;
    }
    if (seen.has(name)) errors.push(`Retirement feature flag ${name} is duplicated`);
    seen.add(name);
    if (flag.status !== "ENABLED") {
      errors.push(`Retirement feature flag ${name} must have status ENABLED`);
    }
    const enabledAt = requireTimestamp(flag.enabledAt, `${field}.enabledAt`, errors);
    if (enabledAt !== null && window.startsAt !== null && enabledAt >= window.startsAt) {
      errors.push(`Retirement feature flag ${name} must be enabled before observation starts`);
    }
    validatePermanentHttpsReference(flag.evidence, `${field}.evidence`, errors);
  });
  for (const name of REQUIRED_RETIREMENT_FEATURE_FLAGS) {
    if (!seen.has(name)) errors.push(`Missing required retirement feature flag ${name}`);
  }
}

function validateZeroCounters(value, field, counterNames, errors) {
  const counters = requireObject(value, field, errors);
  if (!counters) return;
  rejectUnknownKeys(counters, counterNames, field, errors);
  for (const counterName of counterNames) {
    if (counters[counterName] !== 0) {
      errors.push(`${field}.${counterName} must be 0`);
    }
  }
}

function validateLegacySurfaces(value, errors) {
  if (!Array.isArray(value)) {
    errors.push("legacySurfaces must be an array");
    return;
  }
  const seen = new Set();
  value.forEach((surfaceValue, index) => {
    const field = `legacySurfaces[${index}]`;
    const surface = requireObject(surfaceValue, field, errors);
    if (!surface) return;
    rejectUnknownKeys(
      surface,
      ["id", "status", "owner", "evidence", "removalPlan"],
      field,
      errors
    );
    const id = requireString(surface.id, `${field}.id`, errors);
    if (!id) return;
    if (!REQUIRED_LEGACY_SURFACES.includes(id)) {
      errors.push(`${field}.id is not a recognized Legacy surface`);
      return;
    }
    if (seen.has(id)) errors.push(`Legacy surface ${id} is duplicated`);
    seen.add(id);
    if (surface.status !== "READY_TO_RETIRE") {
      errors.push(`Legacy surface ${id} must have status READY_TO_RETIRE`);
    }
    requireString(surface.owner, `${field}.owner`, errors);
    validatePermanentHttpsReference(surface.evidence, `${field}.evidence`, errors);
    validatePermanentHttpsReference(surface.removalPlan, `${field}.removalPlan`, errors);
  });
  for (const id of REQUIRED_LEGACY_SURFACES) {
    if (!seen.has(id)) errors.push(`Missing required Legacy surface ${id}`);
  }
}

function validateRecords(value, errors) {
  const records = requireObject(value, "records", errors);
  if (!records) return;
  const fields = [
    "consumerInventory",
    "trafficAnalysis",
    "dataRetentionPlan",
    "rollbackExpiryApproval",
  ];
  rejectUnknownKeys(records, fields, "records", errors);
  for (const field of fields) {
    validatePermanentHttpsReference(records[field], `records.${field}`, errors);
  }
}

function validateApprovals(value, window, recordedAt, errors) {
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
    if (!REQUIRED_RETIREMENT_APPROVALS.includes(role)) {
      errors.push(`${field}.role is not authorized to approve Legacy retirement`);
      return;
    }
    if (seen.has(role)) errors.push(`Legacy retirement approval ${role} is duplicated`);
    seen.add(role);
    requireString(approval.name, `${field}.name`, errors);
    const approvedAt = requireTimestamp(approval.approvedAt, `${field}.approvedAt`, errors);
    if (approvedAt !== null && window.endsAt !== null && approvedAt <= window.endsAt) {
      errors.push(`${role} approval cannot precede observationWindow.endsAt`);
    }
    if (approvedAt !== null && recordedAt !== null && approvedAt > recordedAt) {
      errors.push(`${role} approval cannot follow recordedAt`);
    }
    validatePermanentHttpsReference(approval.evidence, `${field}.evidence`, errors);
  });
  for (const role of REQUIRED_RETIREMENT_APPROVALS) {
    if (!seen.has(role)) errors.push(`Missing required Legacy retirement approval ${role}`);
  }
}

export function resolveRetirementEvidenceRelativePath(relativePath, expectedReleaseId) {
  if (!SHA_PATTERN.test(expectedReleaseId)) {
    throw new Error("EXPECTED_RELEASE_ID must be the full lowercase 40-character Git commit SHA");
  }
  const normalized = relativePath.replaceAll("\\", "/");
  const expectedPath = `legacy-retirement/${expectedReleaseId}.json`;
  if (normalized !== expectedPath) {
    throw new Error(`LEGACY_RETIREMENT_EVIDENCE_PATH must be ${expectedPath}`);
  }
  return expectedPath;
}

export function validateLegacyRetirementEvidence(
  document,
  { expectedReleaseId, expectedClosureRevision, now = new Date() } = {}
) {
  const errors = [];
  const evidence = requireObject(document, "evidence", errors);
  if (!evidence) return errors;
  findSensitiveFields(evidence, "evidence", errors);
  rejectUnknownKeys(evidence, TOP_LEVEL_KEYS, "evidence", errors);
  if (evidence.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  const releaseId = validateRevision(evidence.releaseId, "releaseId", expectedReleaseId, errors);
  const closureRevision = validateRevision(
    evidence.closureRevision,
    "closureRevision",
    expectedClosureRevision,
    errors
  );
  if (releaseId && closureRevision && releaseId === closureRevision) {
    errors.push("closureRevision must be a commit after the application release");
  }
  if (evidence.decision !== "RETIRE_LEGACY") {
    errors.push("decision must be RETIRE_LEGACY");
  }
  const recordedAt = requireTimestamp(evidence.recordedAt, "recordedAt", errors);
  const window = validateObservationWindow(evidence.observationWindow, recordedAt, now, errors);
  validateFeatureFlags(evidence.featureFlags, window, errors);
  validateZeroCounters(
    evidence.legacyTraffic,
    "legacyTraffic",
    ["authenticatedRequests", "successfulWrites", "knownConsumers", "unsupportedClients"],
    errors
  );
  validateZeroCounters(
    evidence.dataReconciliation,
    "dataReconciliation",
    [
      "pendingLegacyCatalogMappings",
      "unreconciledLegacyTickets",
      "legacyPublicAttachments",
      "orphanedAttachmentObjects",
      "outboxDeadLetters",
    ],
    errors
  );
  validateLegacySurfaces(evidence.legacySurfaces, errors);
  validateRecords(evidence.records, errors);
  validateApprovals(evidence.approvals, window, recordedAt, errors);
  return errors;
}

export function createLegacyRetirementReport(document, options = {}) {
  const now = options.now ?? new Date();
  const errors = validateLegacyRetirementEvidence(document, { ...options, now });
  const flags = Array.isArray(document?.featureFlags) ? document.featureFlags : [];
  const surfaces = Array.isArray(document?.legacySurfaces) ? document.legacySurfaces : [];
  const approvals = Array.isArray(document?.approvals) ? document.approvals : [];
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    releaseId: SHA_PATTERN.test(document?.releaseId) ? document.releaseId : null,
    decision: errors.length === 0 ? "READY_TO_RETIRE" : "KEEP_LEGACY",
    ok: errors.length === 0,
    summary: {
      requiredFeatureFlags: REQUIRED_RETIREMENT_FEATURE_FLAGS.length,
      suppliedFeatureFlags: flags.length,
      requiredLegacySurfaces: REQUIRED_LEGACY_SURFACES.length,
      suppliedLegacySurfaces: surfaces.length,
      requiredApprovals: REQUIRED_RETIREMENT_APPROVALS.length,
      suppliedApprovals: approvals.length,
    },
    errors,
  };
}
