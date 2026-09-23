# Deployment Decisions

Status: active baseline; provider and business-policy confirmations remain open

These decisions provide a concrete target for the remediation phases. A decision marked provisional may be changed before its dependent implementation phase starts.

## D-001 — Deployment model

**Decision:** deploy the Next.js application as a containerized, long-running Node.js service.

Reasons:

- The application uses Prisma with MySQL.
- A container gives development, CI, staging, and production a reproducible runtime.
- It avoids relying on unspecified serverless filesystem and connection-lifecycle behavior.

Constraints:

- The application container must remain stateless.
- At least two replicas should be possible without changing application behavior.
- Runtime filesystem contents must not be treated as durable data.

Phase 8 implements separate immutable application and migration images, non-root runtime,
liveness/readiness probes, rolling-release version identifiers, and container CI gates.

## D-002 — Database

**Decision:** MySQL is the canonical database provider.

Production requirements:

- Managed MySQL is preferred.
- Automated backups and point-in-time recovery should be enabled when available.
- The application must use a least-privilege database account.
- Production migrations must use `prisma migrate deploy`, not `prisma db push`.
- Schema changes must be rehearsed against a recent sanitized backup in staging.

## D-003 — Uploaded files

**Decision:** use private S3-compatible object storage.

Requirements:

- Store object keys and verified metadata in MySQL.
- Authorize every upload and download against the related ticket.
- Use short-lived signed URLs or an authorized download endpoint.
- Do not expose a permanent public uploads directory.
- Define malware scanning, quota, retention, and orphan cleanup before production launch.

Phase 5 implements private S3-compatible storage, verified metadata, malware scanning,
ticket-level authorized delivery, expiring upload references, and durable cleanup jobs.
Files still present under `public/uploads` are legacy migration inputs only; direct web
access to that path is blocked and production rollout must migrate every legacy record
before those files are removed.

## D-004 — Authentication and sessions

**Provisional decision:** retain the existing cookie-based login UX, but redesign server-side session enforcement in phases 1, 2, and 6.

Non-negotiable requirements:

- No default or fallback secret.
- `HttpOnly`, `Secure` in production, and an explicit `SameSite` policy.
- Immediate revocation after password, role, or account-status changes.
- Server-side authorization based on the current database state.
- Rate limiting and audit logging for sensitive operations.

Whether the final implementation uses revocable JWT sessions or database-backed sessions will be decided before phase 6. Database-backed sessions are the safer default for immediate revocation.

## D-005 — Public and administrative capabilities

**Provisional policy:**

- Signup is public and can only create a `USER` account.
- Login and logout are public authentication endpoints.
- Department and FAQ reads may be public if the unauthenticated ticket wizard needs them.
- Department, sub-department, FAQ, predefined-message, user-role, and ticket-transfer mutations are admin-only.
- A normal user may only read and modify resources owned by that user.
- Sender identity and role are derived from the authenticated session, never from request JSON.

Final confirmation of whether department and FAQ reads are public is required before phase 2 is completed.

## D-006 — Environments

**Decision:** use separate development, test, staging, and production environments.

- Each environment has isolated secrets, database, storage bucket/prefix, and session keys.
- Staging should mirror production topology closely enough to validate migrations and deployment behavior.
- Production data must not be copied to lower environments without sanitization.

## D-007 — Release safety

**Decision:** production deployment is blocked unless all required CI checks pass.

Minimum gates:

- deterministic dependency installation
- TypeScript
- ESLint with zero errors
- unit and integration tests
- authorization/security tests
- coverage thresholds for critical modules
- Prisma validation and migration checks
- clean production build
- dependency and secret scanning
- staging smoke tests

## D-008 — Observability boundary

**Decision:** keep application telemetry provider-neutral and export it only through
structured standard output and a private Prometheus-compatible endpoint.

Requirements:

- Every proxied API/page request receives a UUID correlation id that is forwarded to the
  application and returned as `x-request-id`.
- Server error logs contain stable event names, release id, route/operation context, and
  safe error identity without raw exception messages, credentials, or personal data.
- `/api/internal/metrics` requires its own bearer secret, remains private at the ingress,
  and exposes only process, build, and readiness gauges.
- Infrastructure metrics, distributed traces, log retention, alert routing, and paging are
  configured in the selected hosting platform before go-live.

Phase 9 implements the application side of this boundary and documents the vendor-neutral
dashboard, alert, and incident-response contract.

## D-009 — Staging operational acceptance

**Decision:** staging acceptance is a separate, protected, read-only workflow against the
exact reviewed release identifier.

Requirements:

- The workflow targets an HTTPS origin stored in a protected GitHub environment variable.
- The metrics credential is injected from an environment secret and never written to evidence.
- Redirects are rejected so credentials cannot be forwarded to another origin.
- Liveness, readiness, request correlation, security headers, metrics access control, and the
  immutable deployment identifier must all pass.
- Verification failure blocks promotion but never attempts an automatic repair or migration.

Phase 11 implements this provider-neutral acceptance gate. Deployment, backup/restore,
migration rehearsal, load testing, and final promotion still require the selected platform
and named owner approval.

## Decisions still requiring owner confirmation

1. Target hosting provider or VPS platform.
2. Preferred S3-compatible storage provider.
3. Whether anonymous users may read departments and FAQs.
4. Whether users may close or delete their own tickets.
5. Required session duration and inactivity timeout.
6. Required retention period for tickets, attachments, notifications, and audit logs.
7. Backup recovery objectives: acceptable data loss (RPO) and recovery time (RTO).
8. Monitoring/logging provider, log retention, alert recipients, and paging escalation.
