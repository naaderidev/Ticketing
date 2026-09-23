import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";

export const REQUIRED_ENVIRONMENT_KEYS = Object.freeze([
  "APP_ORIGIN",
  "ATTACHMENT_CLEANUP_TOKEN",
  "ATTACHMENT_PENDING_TTL_HOURS",
  "ATTACHMENT_SCAN_MODE",
  "ATTACHMENT_STORAGE_BUCKET",
  "ATTACHMENT_STORAGE_DRIVER",
  "ATTACHMENT_STORAGE_REGION",
  "CLAMAV_HOST",
  "CLAMAV_PORT",
  "DATABASE_URL",
  "DEPLOYMENT_VERSION",
  "FEATURE_AGENT_WORKSPACE_V2_ENABLED",
  "FEATURE_AUTOMATED_RESOLUTION_ENABLED",
  "FEATURE_TRANSACTION_VOLUME_INGESTION_ENABLED",
  "FEATURE_BUSINESS_REFERENCE_INTEGRATIONS_ENABLED",
  "FEATURE_CUSTOMER_EXPERIENCE_V2_ENABLED",
  "FEATURE_ORGANIZATION_CONTEXT_ENABLED",
  "FEATURE_OUTBOX_DISPATCH_ENABLED",
  "FEATURE_REPORTING_PROJECTION_ENABLED",
  "FEATURE_REPORTING_API_ENABLED",
  "FEATURE_RECURRING_PROBLEM_DETECTION_ENABLED",
  "FEATURE_SLA_ENFORCEMENT_ENABLED",
  "FEATURE_SUPPORT_V2_READ_ENABLED",
  "FEATURE_SUPPORT_V2_WRITE_ENABLED",
  "JWT_SECRET",
  "METRICS_TOKEN",
  "OUTBOX_MAX_ATTEMPTS",
  "REPORTING_MAINTENANCE_TOKEN",
  "REPORTING_ROLLOUT_STAGE",
  "REPORTING_CANARY_USER_IDS",
  "REPORTING_PROJECTION_BATCH_SIZE",
  "REPORTING_PROJECTION_LEASE_SECONDS",
  "REPORTING_REBUILD_MAX_EVENTS",
  "REPORTING_REBUILD_SLEEP_MS",
  "SECURITY_HASH_SECRET",
  "SLA_JOB_BATCH_SIZE",
  "SLA_JOB_LOCK_SECONDS",
  "SLA_MAINTENANCE_TOKEN",
  "TRUSTED_PROXY_IP_HEADER",
]);

export const SAFE_DISABLED_FEATURE_FLAGS = Object.freeze([
  "FEATURE_AGENT_WORKSPACE_V2_ENABLED",
  "FEATURE_AUTOMATED_RESOLUTION_ENABLED",
  "FEATURE_TRANSACTION_VOLUME_INGESTION_ENABLED",
  "FEATURE_BUSINESS_REFERENCE_INTEGRATIONS_ENABLED",
  "FEATURE_CUSTOMER_EXPERIENCE_V2_ENABLED",
  "FEATURE_ORGANIZATION_CONTEXT_ENABLED",
  "FEATURE_OUTBOX_DISPATCH_ENABLED",
  "FEATURE_REPORTING_PROJECTION_ENABLED",
  "FEATURE_REPORTING_API_ENABLED",
  "FEATURE_RECURRING_PROBLEM_DETECTION_ENABLED",
  "FEATURE_SLA_ENFORCEMENT_ENABLED",
  "FEATURE_SUPPORT_V2_READ_ENABLED",
  "FEATURE_SUPPORT_V2_WRITE_ENABLED",
]);

const REQUIRED_FILES = Object.freeze([
  ".dockerignore",
  ".env.example",
  ".github/pull_request_template.md",
  ".github/workflows/ci.yml",
  ".github/workflows/go-live-approval.yml",
  ".github/workflows/production-verification.yml",
  ".github/workflows/reporting-controlled-rollout.yml",
  ".github/workflows/release-closure.yml",
  ".github/workflows/legacy-retirement-approval.yml",
  ".github/workflows/staging-rehearsal.yml",
  ".gitignore",
  ".nvmrc",
  "Dockerfile",
  "docs/phase-10-release-candidate.md",
  "docs/phase-11-staging-rehearsal.md",
  "docs/phase-12-production-cutover.md",
  "docs/phase-13-production-hypercare.md",
  "docs/phase-14-release-closure.md",
  "docs/phase-15-legacy-retirement.md",
  "docs/product-refactor/phase-r12-production-cutover.md",
  "docs/product-refactor/phase-r13-production-hypercare.md",
  "docs/product-refactor/phase-r14-release-closure.md",
  "docs/product-refactor/phase-r15-legacy-retirement.md",
  "legacy-retirement/README.md",
  "release-closure/README.md",
  "release-evidence/README.md",
  "scripts/check-go-live-readiness.mjs",
  "scripts/check-staging-readiness.mjs",
  "scripts/go-live-evidence.mjs",
  "scripts/go-live-evidence.test.mjs",
  "scripts/check-production-verification.mjs",
  "scripts/production-verification.mjs",
  "scripts/production-verification.test.mjs",
  "scripts/check-release-closure.mjs",
  "scripts/release-closure-evidence.mjs",
  "scripts/release-closure-evidence.test.mjs",
  "scripts/check-legacy-retirement.mjs",
  "scripts/legacy-retirement-evidence.mjs",
  "scripts/legacy-retirement-evidence.test.mjs",
  "scripts/r5-data-reconciliation.mjs",
  "scripts/r5-runtime-smoke.mjs",
  "scripts/r6-data-reconciliation.mjs",
  "scripts/r6-runtime-smoke.mjs",
  "docs/product-refactor/phase-r6-business-reference-integrations.md",
  "scripts/r7-runtime-smoke.mjs",
  "docs/product-refactor/phase-r7-customer-experience.md",
  "scripts/r8-runtime-smoke.mjs",
  "docs/product-refactor/phase-r8-agent-workspace.md",
  "scripts/r9-runtime-smoke.mjs",
  "docs/product-refactor/phase-r9-ticket-lifecycle.md",
  "docs/product-refactor/phase-r10-release-candidate.md",
  "docs/product-refactor/phase-r11-staging-acceptance.md",
  "docs/product-refactor/phase-kpi-11-backfill-release.md",
  "docs/product-refactor/phase-kpi-12-controlled-rollout.md",
  "scripts/kpi-r11-reporting-backfill-release-smoke.mjs",
  "scripts/check-reporting-controlled-rollout.mjs",
  "scripts/reporting-controlled-rollout.mjs",
  "scripts/reporting-controlled-rollout.test.mjs",
  "src/lib/reporting-rollout-config.ts",
  "src/app/api/internal/reporting/readiness/route.ts",
  "src/modules/reporting/application/reporting-reconciliation-service.ts",
  "src/__tests__/database/reporting-backfill-release-integration.test.ts",
  "scripts/staging-rehearsal.mjs",
  "src/app/api/health/live/route.ts",
  "src/app/api/health/ready/route.ts",
  "src/app/api/internal/metrics/route.ts",
  "src/app/api/internal/sla/process/route.ts",
  "src/app/api/internal/tickets/lifecycle/process/route.ts",
]);

function stripSqlComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");
}

export function findDestructiveSqlOperations(source) {
  const sql = stripSqlComments(source);
  const operations = [
    ["DROP TABLE", /\bDROP\s+TABLE\b/i],
    ["DROP COLUMN", /\bDROP\s+COLUMN\b/i],
    ["TRUNCATE", /\bTRUNCATE(?:\s+TABLE)?\b/i],
    ["DELETE FROM", /\bDELETE\s+FROM\b/i],
  ];

  return operations
    .filter(([, pattern]) => pattern.test(sql))
    .map(([name]) => name);
}

function unquoteEnvironmentValue(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseEnvironmentAssignments(source) {
  const assignments = new Map();

  for (const line of source.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      assignments.set(match[1], unquoteEnvironmentValue(match[2]));
    }
  }

  return assignments;
}

export function parseEnvironmentKeys(source) {
  return new Set(parseEnvironmentAssignments(source).keys());
}

export function findUnpinnedActions(workflow) {
  return [...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)]
    .map((match) => match[1])
    .filter((action) => !/@[a-f0-9]{40}$/i.test(action));
}

export function validateRuntimeVersions({ dockerfile, nvmrc, packageJson }) {
  const errors = [];
  const nodeVersion = nvmrc.trim();
  const versionMatch = nodeVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);

  if (!versionMatch) {
    return [".nvmrc must contain one exact semantic Node.js version"];
  }

  const nodeMajor = Number(versionMatch[1]);
  const dockerVersion = dockerfile.match(/^FROM\s+node:([0-9]+\.[0-9]+\.[0-9]+)-[^@\s]+@sha256:[a-f0-9]{64}\s+AS\s+base$/m)?.[1];

  if (dockerVersion !== nodeVersion) {
    errors.push(`Docker base Node.js version (${dockerVersion ?? "missing"}) does not match .nvmrc (${nodeVersion})`);
  }

  const expectedEngine = `>=${nodeMajor} <${nodeMajor + 1}`;
  if (packageJson.engines?.node !== expectedEngine) {
    errors.push(`package.json engines.node must be ${expectedEngine}`);
  }

  return errors;
}

export function validateLockfile(packageJson, lockfile) {
  const errors = [];
  const lockRoot = lockfile.packages?.[""];

  if (lockfile.lockfileVersion !== 3) {
    errors.push("package-lock.json must use lockfileVersion 3");
  }

  if (!lockRoot) {
    return [...errors, "package-lock.json is missing its root package entry"];
  }

  for (const field of ["name", "version", "dependencies", "devDependencies", "engines"]) {
    if (!isDeepStrictEqual(packageJson[field], lockRoot[field])) {
      errors.push(`package-lock.json root ${field} does not match package.json`);
    }
  }

  return errors;
}

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function check(name, errors, details) {
  return {
    name,
    status: errors.length === 0 ? "pass" : "fail",
    ...(errors.length > 0 ? { errors } : {}),
    ...(details === undefined ? {} : { details }),
  };
}

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function createReport(checks) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    releaseId: process.env.DEPLOYMENT_VERSION || null,
    nodeVersion: process.version,
    ok: checks.every((item) => item.status === "pass"),
    checks,
  };
}

export function validateReleaseIdentity({
  expectedSourceRevision,
  releaseId,
  required = false,
}) {
  if (!releaseId) {
    return required ? ["DEPLOYMENT_VERSION is required for release-candidate evidence"] : [];
  }

  const errors = [];
  if (!/^[a-f0-9]{40}$/.test(releaseId)) {
    errors.push("DEPLOYMENT_VERSION must be the full lowercase 40-character Git commit SHA");
  }
  if (expectedSourceRevision && releaseId !== expectedSourceRevision) {
    errors.push("DEPLOYMENT_VERSION does not match the checked-out source revision");
  }
  return errors;
}

async function collectMigrationEvidence(repositoryRoot) {
  const migrationsRoot = path.join(repositoryRoot, "prisma", "migrations");
  const entries = await readdir(migrationsRoot, { withFileTypes: true });
  const migrationNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const errors = [];
  const migrations = [];

  if (migrationNames.length === 0) {
    errors.push("No Prisma migrations were found");
  }

  for (const name of migrationNames) {
    if (!/^\d{14}_[a-z0-9_]+$/.test(name)) {
      errors.push(`Migration directory has an invalid name: ${name}`);
    }

    const migrationPath = path.join(migrationsRoot, name, "migration.sql");
    if (!(await fileExists(migrationPath))) {
      errors.push(`Migration is missing migration.sql: ${name}`);
      continue;
    }

    const sql = await readFile(migrationPath, "utf8");
    if (sql.trim().length === 0) {
      errors.push(`Migration is empty: ${name}`);
    }

    const destructiveOperations = findDestructiveSqlOperations(sql);
    if (destructiveOperations.length > 0) {
      errors.push(`${name} contains destructive SQL: ${destructiveOperations.join(", ")}`);
    }

    migrations.push({
      name,
      sha256: sha256(sql),
    });
  }

  return { errors, migrations };
}

export async function checkReleaseReadiness(
  repositoryRoot,
  {
    requireReleaseId = false,
    expectedSourceRevision =
      process.env.EXPECTED_SOURCE_REVISION || process.env.GITHUB_SHA,
  } = {}
) {
  const read = (relativePath) => readFile(path.join(repositoryRoot, relativePath), "utf8");
  const checks = [];

  const missingFiles = [];
  for (const relativePath of REQUIRED_FILES) {
    if (!(await fileExists(path.join(repositoryRoot, relativePath)))) {
      missingFiles.push(relativePath);
    }
  }
  checks.push(check("required-release-files", missingFiles.map((file) => `Missing ${file}`)));

  if (missingFiles.length > 0) {
    return createReport(checks);
  }

  const [
    dockerfile,
    envExample,
    gitignore,
    dockerignore,
    nvmrc,
    packageSource,
    lockSource,
    workflow,
    goLiveWorkflow,
    productionWorkflow,
    reportingRolloutWorkflow,
    closureWorkflow,
    retirementWorkflow,
    stagingWorkflow,
    stagingVerifier,
    productionVerifier,
    retirementVerifier,
  ] = await Promise.all([
    read("Dockerfile"),
    read(".env.example"),
    read(".gitignore"),
    read(".dockerignore"),
    read(".nvmrc"),
    read("package.json"),
    read("package-lock.json"),
    read(".github/workflows/ci.yml"),
    read(".github/workflows/go-live-approval.yml"),
    read(".github/workflows/production-verification.yml"),
    read(".github/workflows/reporting-controlled-rollout.yml"),
    read(".github/workflows/release-closure.yml"),
    read(".github/workflows/legacy-retirement-approval.yml"),
    read(".github/workflows/staging-rehearsal.yml"),
    read("scripts/staging-rehearsal.mjs"),
    read("scripts/production-verification.mjs"),
    read("scripts/legacy-retirement-evidence.mjs"),
  ]);
  const packageJson = JSON.parse(packageSource);
  const lockfile = JSON.parse(lockSource);

  checks.push(
    check(
      "immutable-release-identity",
      validateReleaseIdentity({
        expectedSourceRevision,
        releaseId: process.env.DEPLOYMENT_VERSION,
        required: requireReleaseId,
      }),
      {
        mode: requireReleaseId ? "release-candidate" : "repository-contract",
        releaseId: process.env.DEPLOYMENT_VERSION || null,
      }
    )
  );

  checks.push(check("runtime-version-alignment", validateRuntimeVersions({ dockerfile, nvmrc, packageJson }), {
    node: nvmrc.trim(),
    npm: packageJson.packageManager,
  }));
  checks.push(check("lockfile-consistency", validateLockfile(packageJson, lockfile)));

  const environmentAssignments = parseEnvironmentAssignments(envExample);
  const environmentKeys = new Set(environmentAssignments.keys());
  const missingEnvironmentKeys = REQUIRED_ENVIRONMENT_KEYS
    .filter((key) => !environmentKeys.has(key))
    .map((key) => `.env.example is missing ${key}`);
  const unsafeFeatureDefaults = SAFE_DISABLED_FEATURE_FLAGS
    .filter((key) => environmentAssignments.get(key) !== "false")
    .map((key) => `.env.example must default ${key} to false`);
  checks.push(
    check(
      "production-environment-contract",
      [...missingEnvironmentKeys, ...unsafeFeatureDefaults],
      {
        requiredKeys: REQUIRED_ENVIRONMENT_KEYS,
        safeDisabledFeatureFlags: SAFE_DISABLED_FEATURE_FLAGS,
      }
    )
  );

  const dockerErrors = [];
  if (!/^FROM\s+node:[^\s]+@sha256:[a-f0-9]{64}\s+AS\s+base$/m.test(dockerfile)) {
    dockerErrors.push("Docker base image must be pinned by SHA-256 digest");
  }
  if (!/^USER\s+nextjs$/m.test(dockerfile)) {
    dockerErrors.push("Application container must run as the nextjs user");
  }
  if (!/^HEALTHCHECK\b/m.test(dockerfile)) {
    dockerErrors.push("Application container must define a HEALTHCHECK");
  }
  if (!/CMD \["\.\/node_modules\/\.bin\/prisma", "migrate", "deploy"\]/.test(dockerfile)) {
    dockerErrors.push("Migrator target must run prisma migrate deploy");
  }
  checks.push(check("container-release-contract", dockerErrors));

  const workflowErrors = findUnpinnedActions(
    `${workflow}\n${stagingWorkflow}\n${goLiveWorkflow}\n${productionWorkflow}\n${reportingRolloutWorkflow}\n${closureWorkflow}\n${retirementWorkflow}`
  )
    .map((action) => `GitHub Action is not pinned to a full commit SHA: ${action}`);
  for (const expectedJob of ["quality:", "secrets:", "container:"]) {
    if (!workflow.includes(`  ${expectedJob}`)) {
      workflowErrors.push(`CI workflow is missing the ${expectedJob.slice(0, -1)} job`);
    }
  }
  const requiredWorkflowGates = [
    "npm run verify:release-contract",
    "npm run test:release-contract",
    "npm run test:staging-rehearsal",
    "npm run test:go-live-evidence",
    "npm run test:production-verification",
    "npm run test:release-closure",
    "npm run test:legacy-retirement",
    "npm run test:kpi-r11-reporting-release",
    "npm run test:kpi-r12-controlled-rollout",
    "npm audit --omit=dev --audit-level=high",
    "npm run test:e2e",
    "--target runner",
    "--target migrator",
    "format: cyclonedx",
    "severity: HIGH,CRITICAL",
    "Apply migrations to disposable database",
    "/api/health/live",
    "/api/health/ready",
    "/api/internal/metrics",
    "/api/internal/sla/process",
    "/api/internal/tickets/lifecycle/process",
    "--require-release-id",
    ...SAFE_DISABLED_FEATURE_FLAGS.map((key) => `${key}: "false"`),
  ];
  for (const requiredGate of requiredWorkflowGates) {
    if (!workflow.includes(requiredGate)) {
      workflowErrors.push(`CI workflow is missing required release gate: ${requiredGate}`);
    }
  }
  for (const requiredStagingGate of [
    "environment: staging",
    "STAGING_METRICS_TOKEN: ${{ secrets.STAGING_METRICS_TOKEN }}",
    'STAGING_RELEASE_SAMPLE_COUNT: "5"',
    "node scripts/check-staging-readiness.mjs --output staging-rehearsal.json",
    "if: always()",
  ]) {
    if (!stagingWorkflow.includes(requiredStagingGate)) {
      workflowErrors.push(
        `Staging workflow is missing required acceptance gate: ${requiredStagingGate}`
      );
    }
  }
  for (const requiredReportingRolloutGate of [
    "environment: production-observation",
    "REPORTING_ROLLOUT_FROM_STAGE: ${{ inputs.from_stage }}",
    "REPORTING_ROLLOUT_TARGET_STAGE: ${{ inputs.target_stage }}",
    "PRODUCTION_REPORTING_MAINTENANCE_TOKEN",
    "node scripts/check-reporting-controlled-rollout.mjs",
    "if: always()",
    "retention-days: 90",
  ]) {
    if (!reportingRolloutWorkflow.includes(requiredReportingRolloutGate)) {
      workflowErrors.push(
        `Reporting rollout workflow is missing required gate: ${requiredReportingRolloutGate}`
      );
    }
  }
  for (const requiredVerifierControl of [
    'runCheck("application-shell"',
    'runCheck("metrics-and-release-consistency"',
    'runCheck("maintenance-method-boundaries"',
    '"/api/internal/sla/process"',
    '"/api/internal/tickets/lifecycle/process"',
  ]) {
    if (!stagingVerifier.includes(requiredVerifierControl)) {
      workflowErrors.push(
        `Staging verifier is missing required control: ${requiredVerifierControl}`
      );
    }
  }
  for (const requiredGoLiveGate of [
    "environment: production-approval",
    "evidence_revision:",
    "ref: ${{ inputs.evidence_revision }}",
    "ref: ${{ inputs.release_id }}",
    "git -C .release-source rev-parse HEAD",
    "git merge-base --is-ancestor",
    "working-directory: .release-source",
    "node .release-source/scripts/check-go-live-readiness.mjs --output go-live-readiness.json",
    "if: always()",
    "retention-days: 90",
  ]) {
    if (!goLiveWorkflow.includes(requiredGoLiveGate)) {
      workflowErrors.push(
        `Go-Live workflow is missing required approval gate: ${requiredGoLiveGate}`
      );
    }
  }
  for (const requiredProductionGate of [
    "environment: production-observation",
    "PRODUCTION_METRICS_TOKEN: ${{ secrets.PRODUCTION_METRICS_TOKEN }}",
    'PRODUCTION_OBSERVATION_COUNT: "3"',
    'PRODUCTION_RELEASE_SAMPLE_COUNT: "5"',
    "ref: ${{ inputs.evidence_revision }}",
    "ref: ${{ inputs.release_id }}",
    "git merge-base --is-ancestor",
    "node .release-source/scripts/check-go-live-readiness.mjs",
    "node .release-source/scripts/check-production-verification.mjs",
    "if: always()",
    "retention-days: 90",
  ]) {
    if (!productionWorkflow.includes(requiredProductionGate)) {
      workflowErrors.push(
        `Production workflow is missing required observation gate: ${requiredProductionGate}`
      );
    }
  }
  for (const requiredProductionControl of [
    "verifyReadOnlyRuntimeEnvironment",
    'decision: ok ? "OBSERVATION_PASS" : "ROLLBACK_REVIEW_REQUIRED"',
    "if (!runtimeReport.ok) break",
    "Production observation window must not exceed 15 minutes",
  ]) {
    if (!productionVerifier.includes(requiredProductionControl)) {
      workflowErrors.push(
        `Production verifier is missing required control: ${requiredProductionControl}`
      );
    }
  }
  for (const requiredClosureGate of [
    "environment: production-closure",
    "permissions:",
    "contents: read",
    "ref: ${{ inputs.closure_revision }}",
    "ref: ${{ inputs.release_id }}",
    'test "${EXPECTED_RELEASE_ID}" != "${EXPECTED_GO_LIVE_EVIDENCE_REVISION}"',
    'test "${EXPECTED_GO_LIVE_EVIDENCE_REVISION}" != "${CLOSURE_REVISION}"',
    'git merge-base --is-ancestor "${EXPECTED_RELEASE_ID}" "${EXPECTED_GO_LIVE_EVIDENCE_REVISION}"',
    'git merge-base --is-ancestor "${EXPECTED_GO_LIVE_EVIDENCE_REVISION}" "${CLOSURE_REVISION}"',
    "working-directory: .release-source",
    "node .release-source/scripts/check-go-live-readiness.mjs",
    "node .release-source/scripts/check-release-closure.mjs",
    "if: always()",
    "retention-days: 365",
  ]) {
    if (!closureWorkflow.includes(requiredClosureGate)) {
      workflowErrors.push(
        `Release closure workflow is missing required gate: ${requiredClosureGate}`
      );
    }
  }
  for (const requiredRetirementGate of [
    "environment: legacy-retirement-approval",
    "permissions:",
    "contents: read",
    "ref: ${{ inputs.retirement_revision }}",
    "ref: ${{ inputs.release_id }}",
    'test "${EXPECTED_CLOSURE_REVISION}" != "${RETIREMENT_REVISION}"',
    'git merge-base --is-ancestor "${EXPECTED_RELEASE_ID}" "${EXPECTED_GO_LIVE_EVIDENCE_REVISION}"',
    'git merge-base --is-ancestor "${EXPECTED_GO_LIVE_EVIDENCE_REVISION}" "${EXPECTED_CLOSURE_REVISION}"',
    'git merge-base --is-ancestor "${EXPECTED_CLOSURE_REVISION}" "${RETIREMENT_REVISION}"',
    "working-directory: .release-source",
    "node .release-source/scripts/check-go-live-readiness.mjs",
    "node .release-source/scripts/check-release-closure.mjs",
    "node .release-source/scripts/check-legacy-retirement.mjs",
    "without deleting anything",
    "if: always()",
    "retention-days: 365",
  ]) {
    if (!retirementWorkflow.includes(requiredRetirementGate)) {
      workflowErrors.push(
        `Legacy retirement workflow is missing required gate: ${requiredRetirementGate}`
      );
    }
  }
  for (const requiredRetirementControl of [
    "REQUIRED_RETIREMENT_FEATURE_FLAGS",
    "REQUIRED_LEGACY_SURFACES",
    "Legacy retirement observation must last at least 30 days",
    'decision: errors.length === 0 ? "READY_TO_RETIRE" : "KEEP_LEGACY"',
  ]) {
    if (!retirementVerifier.includes(requiredRetirementControl)) {
      workflowErrors.push(
        `Legacy retirement verifier is missing required control: ${requiredRetirementControl}`
      );
    }
  }
  checks.push(check("ci-release-gates", workflowErrors));

  const ignoreErrors = [];
  if (!/^\.env\*$/m.test(gitignore) || !/^!\.env\.example$/m.test(gitignore)) {
    ignoreErrors.push(".gitignore must exclude environment files and explicitly retain .env.example");
  }
  for (const ignoredPath of [
    ".git",
    "node_modules",
    "public/uploads",
    "release-evidence",
    "release-closure",
    "legacy-retirement",
  ]) {
    if (!dockerignore.split(/\r?\n/).includes(ignoredPath)) {
      ignoreErrors.push(`.dockerignore must exclude ${ignoredPath}`);
    }
  }
  if (!dockerignore.split(/\r?\n/).includes(".env.*")) {
    ignoreErrors.push(".dockerignore must exclude .env.* files");
  }
  if (!gitignore.split(/\r?\n/).includes("/go-live-readiness.json")) {
    ignoreErrors.push(".gitignore must exclude generated Go-Live readiness reports");
  }
  if (!gitignore.split(/\r?\n/).includes("/production-verification.json")) {
    ignoreErrors.push(".gitignore must exclude generated production verification reports");
  }
  if (!dockerignore.split(/\r?\n/).includes("production-verification.json")) {
    ignoreErrors.push(".dockerignore must exclude generated production verification reports");
  }
  if (!gitignore.split(/\r?\n/).includes("/release-closure-readiness.json")) {
    ignoreErrors.push(".gitignore must exclude generated release closure reports");
  }
  if (!dockerignore.split(/\r?\n/).includes("release-closure-readiness.json")) {
    ignoreErrors.push(".dockerignore must exclude generated release closure reports");
  }
  if (!gitignore.split(/\r?\n/).includes("/legacy-retirement-readiness.json")) {
    ignoreErrors.push(".gitignore must exclude generated Legacy retirement reports");
  }
  if (!dockerignore.split(/\r?\n/).includes("legacy-retirement-readiness.json")) {
    ignoreErrors.push(".dockerignore must exclude generated Legacy retirement reports");
  }
  checks.push(check("secret-and-build-context-exclusions", ignoreErrors));

  const migrationEvidence = await collectMigrationEvidence(repositoryRoot);
  checks.push(check("migration-integrity", migrationEvidence.errors, {
    migrations: migrationEvidence.migrations,
  }));

  return createReport(checks);
}
