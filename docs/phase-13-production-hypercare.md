# Phase 13 — Production Verification and Hypercare

## Outcome

Phase 13 adds a fail-closed, read-only verification boundary after an approved production
cutover. It observes the immutable release at `initial`, `midpoint`, and `closure` checkpoints
without deploying, changing traffic, running maintenance jobs, querying customer data, or
performing rollback.

## Runtime contract

Each checkpoint performs three observations separated by 15 seconds. Every observation checks
liveness, readiness, security headers, the RTL application shell, unauthenticated metrics denial,
five authenticated release-identity samples, and GET method denial on both maintenance endpoints.
The first failed observation stops further sampling and produces `ROLLBACK_REVIEW_REQUIRED`.

Inputs are restricted to an exact HTTPS production origin, a protected metrics read token, a full
lowercase release SHA, a named checkpoint, bounded request timeouts, bounded sample counts, and an
overall observation window no longer than 15 minutes. Redirects, oversized responses, mixed
release versions, missing request IDs, and accidental token disclosure fail closed.

## Protected workflow

`Production Post-Deployment Verification` runs in the least-privilege
`production-observation` environment. It checks out the application release and the separate
approved evidence revision, verifies both SHAs and their ancestry, revalidates R12 evidence using
code from the application release, then runs the production observer from that same trusted code.
Both sanitized reports are retained for 90 days.

The environment must contain only the production origin and a read-only metrics token. Deployment,
database, storage, scheduler, and cloud control-plane credentials must not be exposed to this job.

## Closure boundary

An `OBSERVATION_PASS` covers only one checkpoint. Operational closure additionally requires all
three checkpoint artifacts plus external confirmation from On-call, Service Owner, and Release
Owner that no unresolved security, data-integrity, Sev-1/Sev-2, SLA, capacity, or customer-impact
issue remains. The repository never fabricates these external records.

Repository implementation is complete. Actual release closure remains
`PENDING_EXTERNAL_EVIDENCE` until a real approved deployment and all three protected production
checks exist.
