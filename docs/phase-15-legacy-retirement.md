# Phase 15 — Legacy Retirement Readiness

## Outcome

Phase 15 adds a fail-closed approval boundary before removing any Legacy UI, API, compatibility,
attachment, mapping, or reconciliation path. It never deletes or mutates code, data, schemas,
traffic, feature flags, backups, or production infrastructure.

## Evidence contract

Retirement requires an immutable ancestry chain from application release through Go-Live evidence,
release closure, and a distinct retirement evidence revision. All eight new-platform feature flags
must remain enabled before and throughout a 30-to-180-day observation window.

Authenticated Legacy requests, successful writes, known consumers, unsupported clients, pending
catalog mappings, unreconciled tickets, public Legacy attachments, orphaned objects, and outbox
dead letters must all be zero. Each of six Legacy surfaces requires `READY_TO_RETIRE`, a named
owner, permanent evidence, and an independent removal plan.

Consumer inventory, traffic analysis, data retention, and rollback-expiry records are mandatory.
Product, Architecture, Database, Security, and Service owners must approve after observation ends.
Secrets, temporary URLs, placeholders, unsupported fields, invalid timestamps, and incomplete
evidence produce `KEEP_LEGACY`.

## Protected workflow

`Legacy Retirement Approval` runs with `contents: read` only, proves the entire evidence ancestry,
and executes every validator from the immutable application release. Sanitized reports are retained
for 365 days. A successful result only permits a separate reviewed removal change; it does not
remove anything itself.

Repository implementation is complete. Actual retirement remains `KEEP_LEGACY` because no real
closed release, 30-day observation, zero-usage evidence, or named approvals were supplied.
