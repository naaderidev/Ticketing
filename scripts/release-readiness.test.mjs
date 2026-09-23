import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkReleaseReadiness,
  findDestructiveSqlOperations,
  findUnpinnedActions,
  parseEnvironmentAssignments,
  parseEnvironmentKeys,
  validateLockfile,
  validateReleaseIdentity,
  validateRuntimeVersions,
} from "./release-readiness.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

test("parses only environment assignments", () => {
  const keys = parseEnvironmentKeys("# TOKEN=ignored\nDATABASE_URL=value\n METRICS_TOKEN = value\ninvalid=value\n");
  assert.deepEqual([...keys], ["DATABASE_URL", "METRICS_TOKEN"]);
});

test("normalizes quoted environment values", () => {
  const assignments = parseEnvironmentAssignments(
    'FEATURE_ONE="false"\nFEATURE_TWO=\'false\'\nFEATURE_THREE=true\n'
  );
  assert.deepEqual([...assignments], [
    ["FEATURE_ONE", "false"],
    ["FEATURE_TWO", "false"],
    ["FEATURE_THREE", "true"],
  ]);
});

test("requires an immutable release identifier for candidate evidence", () => {
  const commitSha = "a".repeat(40);
  assert.deepEqual(
    validateReleaseIdentity({ releaseId: commitSha, expectedSourceRevision: commitSha, required: true }),
    []
  );
  assert.equal(validateReleaseIdentity({ releaseId: "main", required: true }).length, 1);
  assert.equal(
    validateReleaseIdentity({ releaseId: commitSha, expectedSourceRevision: "b".repeat(40) }).length,
    1
  );
  assert.equal(validateReleaseIdentity({ releaseId: null, required: true }).length, 1);
  assert.deepEqual(validateReleaseIdentity({ releaseId: null }), []);
});

test("requires GitHub Actions to use full commit SHAs", () => {
  const workflow = [
    "- uses: actions/checkout@0123456789012345678901234567890123456789 # v1",
    "- uses: actions/setup-node@v4",
  ].join("\n");
  assert.deepEqual(findUnpinnedActions(workflow), ["actions/setup-node@v4"]);
});

test("aligns exact Node.js versions across release inputs", () => {
  const dockerfile = "FROM node:24.21.0-bookworm-slim@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa AS base";
  const packageJson = { engines: { node: ">=24 <25" } };
  assert.deepEqual(validateRuntimeVersions({ dockerfile, nvmrc: "24.21.0\n", packageJson }), []);
  assert.equal(validateRuntimeVersions({ dockerfile, nvmrc: "24.20.0", packageJson }).length, 1);
});

test("detects data-destructive SQL but permits constraint replacement", () => {
  assert.deepEqual(findDestructiveSqlOperations("ALTER TABLE Ticket DROP FOREIGN KEY Ticket_userId_fkey;"), []);
  assert.deepEqual(findDestructiveSqlOperations("ALTER TABLE Ticket DROP COLUMN legacy;"), ["DROP COLUMN"]);
  assert.deepEqual(findDestructiveSqlOperations("-- DROP TABLE ignored\nSELECT 1;"), []);
});

test("detects a stale lockfile root", () => {
  const packageJson = {
    name: "app",
    version: "1.0.0",
    dependencies: { next: "1.0.0" },
    devDependencies: {},
    engines: { node: ">=24 <25" },
  };
  const lockfile = {
    lockfileVersion: 3,
    packages: { "": { ...packageJson, dependencies: { next: "0.9.0" } } },
  };
  assert.deepEqual(validateLockfile(packageJson, lockfile), [
    "package-lock.json root dependencies does not match package.json",
  ]);
});

test("the repository satisfies its release contract", async () => {
  const report = await checkReleaseReadiness(repositoryRoot);
  const failures = report.checks.filter((item) => item.status === "fail");
  assert.deepEqual(failures, []);
  assert.equal(report.ok, true);
});
