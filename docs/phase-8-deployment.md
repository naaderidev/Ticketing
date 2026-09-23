# Phase 8 — Deployment Packaging and Release Operations

Status: implementation complete; container CI and staging acceptance pending

Recorded: 2026-09-13

## Scope

This phase turns the verified application into a reproducible deployment artifact without
choosing a hosting vendor. It adds an immutable, non-root application image, a separate
one-shot migration image, runtime health contracts, image vulnerability gates, and an
explicit release/rollback runbook. It does not apply migrations to the current database.

## Artifact model

The multi-stage `Dockerfile` creates two release artifacts from one locked source tree:

- `runner` contains only the Next.js standalone server, static assets, public assets, and
  the production runtime. It runs as UID/GID 1001 and contains no source control metadata,
  environment files, test artifacts, or legacy `public/uploads` content.
- `migrator` contains the locked Prisma CLI and reviewed migration directory. It performs
  exactly `prisma migrate deploy` and is never used as an application replica.

The Node base and CI MySQL service use digest-pinned images. The application build receives
the full commit SHA as `DEPLOYMENT_VERSION`; Next.js also uses it as `deploymentId` to avoid
mixing client assets and server code during a rolling update.

The final runtime image does not contain credentials. All configuration and secrets are
injected by the deployment platform at runtime. Application files remain root-owned and
read-only to the unprivileged process; only the Next.js cache directory is process-writable.

## Health contract

| Endpoint | Meaning | Dependencies | Orchestrator use |
| --- | --- | --- | --- |
| `/api/health/live` | The Node process can serve HTTP | None | Liveness/restart probe |
| `/api/health/ready` | Required configuration is valid and MySQL answers `SELECT 1` | Environment and MySQL | Readiness/traffic gate |

Readiness checks are cached for five seconds and concurrent probes are deduplicated to
bound database load. Failures return 503 and log only the error type, not connection URLs,
credentials, or internal exception messages. S3 and ClamAV are intentionally excluded from
readiness so a downstream outage cannot churn every application replica; their health must
be monitored independently and exercised by staging acceptance tests.

The reverse proxy should expose liveness only to the orchestrator and keep readiness on an
internal network. Neither endpoint returns build metadata or secrets.

## Required runtime configuration

Production readiness remains false unless all phase 1, 5, and 6 settings are valid,
including:

- `DATABASE_URL`, `DEPLOYMENT_VERSION`, `JWT_SECRET`, `SECURITY_HASH_SECRET`, `APP_ORIGIN`;
- a dedicated `METRICS_TOKEN` for private monitoring scrapes;
- `TRUSTED_PROXY_IP_HEADER` configured for a header overwritten by the trusted ingress;
- private attachment storage region/bucket and credentials or workload identity;
- enabled ClamAV mode and host;
- a distinct `ATTACHMENT_CLEANUP_TOKEN` of at least 32 characters.
- a distinct `SLA_MAINTENANCE_TOKEN` of at least 32 characters, never shared with session,
  metrics, or attachment-cleanup credentials;
- a distinct `REPORTING_MAINTENANCE_TOKEN` of at least 32 characters and explicit
  `FEATURE_REPORTING_PROJECTION_ENABLED=false` until the reporting worker rollout;
- explicit `FEATURE_REPORTING_API_ENABLED=false` until projection freshness,
  reconciliation and reporting permission grants are verified;
- explicit R5 rollout flags, initially `FEATURE_OUTBOX_DISPATCH_ENABLED=false` and
  `FEATURE_SLA_ENFORCEMENT_ENABLED=false`.

`DEPLOYMENT_VERSION` must be an immutable 1–64 character identifier containing only letters,
numbers, dot, underscore, or hyphen. Use the full Git commit SHA.

## CI release gates

After the phase 7 quality job passes, the container job must:

1. build both targets with the immutable release identifier;
2. fail on any detected HIGH or CRITICAL vulnerability in either image;
3. start a disposable digest-pinned MySQL 8.4 service;
4. execute every repository migration through the migration image;
5. start the application image with production-mode configuration;
6. require both liveness and readiness to pass.
7. reject unauthenticated metrics access and accept the dedicated metrics token.
8. reject unauthenticated SLA maintenance and accept its dedicated token while proving
   that dispatch remains disabled by default.

Branch protection must require `Quality and browser gates`, `Secret scan`, and
`Container, migration, and runtime gates`. A green workflow alone is not a production
approval: the staging gates below are also mandatory.

## Release procedure

1. Resolve every pending decision in `deployment-decisions.md` that affects the target
   environment. Create isolated production database, bucket, scanner, secrets, and ingress.
2. Run the complete CI workflow. Build once, push both images to the registry, record their
   immutable digests and the source commit, and deploy those exact digests to staging.
3. Restore a recent sanitized production backup into staging. Verify `prisma migrate status`,
   rehearse the migration image, record duration and locks, then run authenticated browser,
   authorization, attachment upload/download/scan/cleanup, proxy-IP, and audit-log tests.
   Run `npm run verify:r5-data`, then exercise the SLA maintenance endpoint twice and prove
   that the second run is idempotent and the delivery ledger has no retry or dead-letter rows.
4. Verify that production backup and point-in-time recovery are healthy and record a restore
   checkpoint. Confirm the change window, owner, rollback operator, and alert routing.
5. Stop if any migration is destructive, long-locking, or incompatible with the previous
   application. Convert it to an expand/contract sequence before release.
6. Run the reviewed migration image once against production. Do not start new application
   replicas until it succeeds and `prisma migrate status` is clean.
7. Roll out the application image by digest with at least two replicas, zero unavailable
   replicas, readiness gating, connection draining, and a termination grace period of at
   least 30 seconds. Never reuse a mutable image tag.
8. Run the staging acceptance suite against production-safe smoke accounts. Observe error
   rate, latency, readiness, database connections, authentication failures, storage/scanner
   failures, and audit events throughout the agreed observation window.
9. Record release evidence: commit, image digests, migration output, backup checkpoint,
   smoke results, operator, timestamps, and any accepted residual risk.

The platform scheduler must call `POST /api/internal/sla/process` at least once per minute,
with overlapping runs permitted because claims use expiring atomic locks. Alert on a failed
run, any `RETRY` backlog older than the agreed window, or any `DEAD_LETTER` delivery. Do not
enable SLA enforcement until the official Iran holiday calendar, target durations,
escalation ownership, and reopen behavior have written Product/Operations approval.

The platform scheduler must also call `POST /api/internal/tickets/lifecycle/process` at
least once per hour. It uses the same maintenance credential but an independent rate-limit
and audit scope. Alert on failed runs, duplicate active resolution cycles, or an auto-close
without both required reminders.

The repository ships an executable scheduler instead of relying only on this deployment
convention. Build the `scheduler` Docker target and run exactly one replica with
`MAINTENANCE_BASE_URL`, `SLA_MAINTENANCE_TOKEN`, and
`MAINTENANCE_INTERVAL_SECONDS=60`. For local development, `npm run dev` starts both
Next.js and the scheduler under the repository supervisor. When an external process manager
owns them separately, run `npm run dev:app` next to `npm run scheduler:maintenance`. Jobs run
sequentially with overlap prevention and request timeouts; logs are structured and never
include the bearer token.

The `IR_STANDARD_WORK_WEEK` calendar contains the official 1405 holiday set. Operations
must load the authoritative 1406 calendar before 1406/01/01. Holiday updates are calendar
data changes and do not rewrite historical ticket SLA snapshots.

## Runtime hardening profile

The deployment platform should enforce a read-only root filesystem, writable temporary
storage only for `/tmp` and `/app/.next/cache`, dropped Linux capabilities, no privilege
escalation, CPU/memory limits, and at least two replicas. The database account must have only
the privileges needed by the application; migration credentials should be separate and
available only to the one-shot migration job. TLS terminates at the trusted ingress, which
must replace—not append untrusted client values to—the configured proxy IP header.

## Rollback procedure

Application rollback and schema rollback are different operations:

1. If application health or smoke gates fail, stop the rollout and route traffic back to
   the previously recorded application image digest.
2. Do not automatically reverse database migrations. Phase 4 migrations are forward-only;
   automatic down migrations can lose data or make both application versions unusable.
3. A normal application rollback is allowed only when the new schema remains compatible
   with the previous image. Expand/contract migrations are required to preserve that rule.
4. If a schema defect has already committed, keep the last compatible application running
   and deploy a reviewed forward-fix migration. Restore from the verified checkpoint only
   for confirmed corruption/data loss and only under the incident recovery procedure.
5. After rollback, repeat readiness and critical smoke checks, verify migration state, and
   preserve logs and audit evidence for the incident review.

## Remaining external release blockers

- At phase 8 completion, nine migrations existed. Later product-refactor phases expanded
  that set; staging must always rehearse every migration checksum listed by the current
  release-contract artifact rather than relying on a hard-coded historical count.
- The owner must select the hosting/registry and S3-compatible provider, confirm retention
  policies, and define RPO/RTO.
- Branch protection, registry immutability/retention, production secrets, least-privilege
  identities, monitoring alerts, backup restore, and live S3/ClamAV acceptance require the
  chosen infrastructure and cannot be proven from this repository alone.
- Docker is not installed on the current workstation, so the real image build, scan,
  migration rehearsal, and container smoke test are delegated to the new CI gate and must
  be observed green before production approval.

## Local verification evidence

The phase was verified with zero-warning ESLint, TypeScript, Prisma schema validation, a
production dependency audit (zero findings), 32 Jest suites/244 tests with critical-module
coverage gates, five Chromium smoke/security tests, a successful production build, and a
clean `git diff --check`. Runtime liveness returned HTTP 200. Local readiness correctly
returned HTTP 503 because the workstation is not configured as the production environment;
the CI container job supplies isolated production-mode configuration and a disposable
migrated database and requires readiness to return HTTP 200.
