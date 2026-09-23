# Phase 10 — Release Candidate and Go-Live Readiness

## Outcome

Phase 10 converts the controls from phases 0–9 into an auditable release decision. The
repository can produce a release candidate, but production deployment remains a separate
Go/No-Go event that requires real infrastructure evidence and named owner approval.

The release contract is intentionally read-only. It never connects to a database, applies
migrations, rotates credentials, or changes provider configuration.

## Automated release contract

Run the fast repository contract before opening a pull request:

```bash
npm run verify:release-contract
npm run test:release-contract
```

CI binds the auditable candidate report to the exact checked-out commit:

```bash
DEPLOYMENT_VERSION=<full-lowercase-commit-sha> npm run verify:release-candidate
```

Candidate evidence fails closed when the identifier is absent, is not a full 40-character
Git SHA, or differs from `GITHUB_SHA`.

The verifier fails closed when any of these invariants is broken:

- required deployment, health, metrics, CI, and release-governance files are missing;
- `.nvmrc`, the Docker base image, and `package.json` disagree on Node.js;
- the lockfile root no longer matches the package manifest;
- the production environment example omits a required key;
- the runtime image is not digest-pinned, non-root, or health checked;
- a GitHub Action is referenced by a mutable tag instead of a full commit SHA;
- environment files or local uploads could enter Git or the Docker build context;
- a migration is missing, empty, incorrectly named, or contains `DROP TABLE`,
  `DROP COLUMN`, `TRUNCATE`, or `DELETE FROM`.

Every migration is recorded with its SHA-256 checksum. In CI, the resulting JSON report is
uploaded as `release-contract-<commit-sha>` for 30 days.

For all locally available gates, run:

```bash
npm run verify:release
npm run test:e2e
```

The second command requires a running development server. Container and disposable-database
gates run in CI because Docker is not assumed to exist on every developer workstation.

## Supply-chain evidence

CI builds the application and migration images from the same immutable commit identifier.
It then:

1. generates CycloneDX SBOMs for both images;
2. retains those SBOMs as CI artifacts for 30 days;
3. rejects HIGH or CRITICAL image vulnerabilities, including unfixed findings;
4. applies migrations only to a disposable MySQL service;
5. verifies liveness, readiness, protected metrics, and the non-root production runtime.

Release artifacts must be promoted by digest in the selected registry. Tags are labels and
must not be treated as immutable identities.

## Go/No-Go decision gates

All rows are mandatory. “Repository evidence” can be completed in this repository; “runtime
evidence” requires the selected production-equivalent environment.

| Gate | Required evidence | Owner | No-Go condition |
| --- | --- | --- | --- |
| Source | Protected branch, reviewed PR, green CI, immutable commit SHA | Release owner | Any required check is missing or bypassed |
| Artifact | Runner and migrator image digests plus both SBOMs | Release owner | Images were rebuilt or tags cannot be resolved to reviewed digests |
| Secrets | Unique production secrets in the provider secret store | Security owner | Example, reused, expired, or repository-stored credential |
| Database | Fresh backup, verified restore, migration rehearsal, lock-duration record | Database owner | Restore was not proven or migration exceeds the approved window |
| Storage | Private bucket, encryption, lifecycle, upload/download smoke test | Infrastructure owner | Public access, unscanned object, or retention policy mismatch |
| Malware scan | Reachable ClamAV-compatible service and fail-closed EICAR rehearsal | Security owner | Scanner unavailable or bypassable |
| Network | TLS, trusted proxy header overwrite, health/metrics access restrictions | Infrastructure owner | Client-controlled source IP or public metrics endpoint |
| Observability | Logs ingested, request IDs searchable, alerts routed and acknowledged | On-call owner | No actionable alert path or sensitive data appears in telemetry |
| Capacity | Production-equivalent smoke/load result and resource limits | Service owner | Error/latency budget breached or unbounded resources |
| Rollback | Previous image digest, application rollback command, DB forward-fix plan | Release owner | Rollback cannot be executed inside the recovery objective |

## Required staging rehearsal

Use production-equivalent managed dependencies, not developer substitutes.

1. Record the commit SHA, image digests, SBOM artifact links, approvers, and change window.
2. Restore a sanitized recent backup into isolated staging and prove the restore result.
3. Run the migrator image once. Record duration, locks, Prisma migration status, and checksums.
4. Deploy the exact reviewed runner digest without rebuilding it.
5. Validate authentication, authorization boundaries, ticket lifecycle, both maintenance
   schedulers, private attachments, malware rejection, liveness, readiness, metrics
   authentication, logs, and request IDs.
6. Trigger a safe synthetic failure and verify the correct on-call destination receives it.
7. Roll back the application to the previous digest. For database changes, follow the
   reviewed forward-fix plan; never improvise a destructive down migration.
8. Repeat the smoke suite and obtain explicit owner approval.

## Production execution order

1. Freeze the approved commit and resolve both image tags to immutable digests.
2. Confirm backup and restore evidence is still inside the approved freshness window.
3. Run the migration image as a single controlled job.
4. Stop on any migration error; do not start new application replicas.
5. Roll out the runner digest gradually while watching readiness, error, latency, and
   saturation signals.
6. Complete the smoke checklist and record the Go/No-Go decision.
7. Keep the previous digest and rollback procedure available through the observation window.

## Current readiness statement

At the end of phase 10, repository-level implementation and local verification can be marked
complete. The application must **not** be described as production-ready until all external
rows in the Go/No-Go table have real evidence and named approval.

Known external blockers are:

- deployment provider, registry, domain/TLS, and secret-store selection;
- production-equivalent MySQL, private object storage, and malware scanner provisioning;
- production backup/restore proof and staging rehearsal using every migration recorded in
  the generated release contract (currently 22);
- CI execution of Docker build, SBOM, vulnerability, disposable migration, and runtime gates;
- branch protection, required reviewers, artifact retention, and incident/on-call ownership;
- capacity/load evidence, alert routing, rollback drill, and the final change-window approval.

No migration was applied to the current database during phase 10.
