# Phase 12 — Production Cutover Governance

## Outcome

Phase 12 adds a fail-closed, non-deploying approval boundary between a verified release
candidate and production mutation. It validates a reviewed, release-specific evidence
manifest and records the result through a protected GitHub environment. It never deploys,
applies migrations, changes traffic, or enables feature flags.

## Evidence contract

Each candidate uses `release-evidence/<full-commit-sha>.json`. The manifest is committed in
a separate immutable evidence revision that descends from the application release commit,
avoiding a self-referential SHA. The document must bind the
source SHA, runner and migrator image digests, previous rollback digest, SBOMs, vulnerability
scan, R11 report, production origin, change window, RPO/RTO, and all twelve R10 Go/No-Go
gates. Every gate requires `PASS`, permanent HTTPS evidence, a named owner, the exact owner
role, and an approval timestamp.

The validator rejects placeholders, secret-bearing fields, signed or credential-bearing
URLs, path traversal, stale change windows, release mismatches, duplicate or missing gates,
invalid digests, and rollback to the same image.

## Execution

Configure a protected GitHub environment named `production-approval` with required
reviewers. Commit the reviewed non-secret manifest on top of the release candidate, then
manually run **Go-Live Evidence Approval** with the exact application release SHA, exact
evidence revision SHA, and matching evidence path.

The workflow checks out both immutable revisions, confirms both identities and their ancestry,
runs the repository release contract from the application release checkout, validates the
evidence with the trusted release code, and retains its sanitized report for 90 days. A green
workflow validates governance evidence only; the release owner still runs the provider-specific
cutover during the approved window.

## Current decision

Repository implementation is complete. Production remains **NO_GO** until the real artifact
digests, staging report, backup/restore, migration rehearsal, storage/scanner, authorization,
observability, capacity, rollback evidence, recovery objectives, and named approvals exist.
No placeholder manifest is generated because absence is safer and more auditable than fake
approval evidence.
