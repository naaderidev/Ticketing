# Phase 9 — Observability and Incident Readiness

Status: implementation complete; provider integration and production baseline pending

Recorded: 2026-09-13

## Scope

This phase creates a provider-neutral operational contract for the container built in
phase 8. It adds correlation ids, sanitized structured server-error logs, an authenticated
Prometheus-compatible metrics endpoint, CI coverage for the monitoring boundary, and an
incident runbook. It does not send telemetry to a third party, apply database migrations,
or select a monitoring vendor.

## Correlation contract

Next.js Proxy now covers every application API route in addition to protected pages. It
accepts only UUID-formatted `x-request-id` values, creates one when absent/invalid, forwards
the id to route handlers, and returns the same id to the caller. The trusted ingress must
replace any client-supplied `x-request-id`; it must not append multiple values.

Audit events already persist this request id. Operators can therefore move from an ingress
or client failure to a sanitized application log and then to its related security audit
record without searching on personal identifiers.

## Structured error logs

Unexpected API, readiness, audit persistence, attachment cleanup/migration, and uncaught
Next.js request failures emit one-line JSON to standard error. Records contain:

- UTC timestamp, severity, stable event name, service name, and immutable release id;
- request id, method, route template, operation, or bounded numeric identifiers when
  available;
- error class and a safe Next.js digest when available.

Raw exception messages and stacks are deliberately excluded because database drivers,
storage SDKs, and authorization errors can embed credentials, object keys, request bodies,
or personal data. Context keys that indicate authorization, cookies, passwords, secrets,
tokens, email, mobile/national identifiers, messages, file names, or IP addresses are
dropped before serialization. Detailed debugging uses restricted provider traces or a
controlled reproduction, never broader production logging of sensitive payloads.

## Metrics endpoint

`GET /api/internal/metrics` emits Prometheus text format and currently exports:

| Metric | Meaning |
| --- | --- |
| `ticketing_build_info` | Immutable deployment version label |
| `ticketing_ready` | Runtime configuration and database readiness (1/0) |
| `process_uptime_seconds` | Per-replica Node.js uptime |
| `process_resident_memory_bytes` | Per-replica resident memory |
| `nodejs_heap_used_bytes` | Per-replica JavaScript heap use |

The route requires `Authorization: Bearer <METRICS_TOKEN>` using a constant-time digest
comparison. The token must be distinct from JWT, security-hash, and maintenance secrets.
The ingress must keep the endpoint private and remove it from public routing. Responses are
non-cacheable and contain no user, ticket, attachment, database, host, or credential data.

Scrape each replica rather than load-balancing a single scrape, because process gauges are
instance-local. A 15–30 second interval is an appropriate starting point; tune it only from
measured cost and incident-detection needs.

## Minimum dashboards

Before go-live, the selected platform must provide dashboards for:

1. request volume, status classes, p50/p95/p99 latency, and active connections at ingress;
2. replica count, restarts, readiness, CPU, RSS/heap memory, and event-loop saturation;
3. MySQL connections, query latency, lock waits, storage, replication/backup health;
4. S3 request errors/latency/capacity and ClamAV availability/scan failures;
5. authentication denials, rate limiting, audit-write failures, attachment cleanup backlog,
   legacy migration failures, and deployment version distribution.

Do not attach raw request bodies, query strings, cookies, authorization headers, object
names, or personal identifiers to dashboards or traces.

## Initial alert catalogue

Thresholds below are conservative bootstrap values, not business SLOs. Capture at least two
weeks of staging/production-like baseline data and obtain owner approval before tuning:

- page immediately when all replicas are unready for two consecutive scrapes;
- page on sustained ingress 5xx rate above 2% for five minutes with meaningful traffic;
- warn when p95 server latency exceeds one second for ten minutes;
- warn when a replica restarts repeatedly or RSS remains above 85% of its memory limit;
- warn at 80% database connection/storage capacity and page on backup/PITR failure;
- page on sustained audit persistence failures or malware scanner unavailability;
- warn on attachment deletion backlog/failures and on anomalous authentication/rate-limit
  changes relative to the approved baseline;
- page when more than one deployment version remains after the rollout window.

Every alert must identify its owner, severity, notification route, acknowledgement target,
and linked runbook. Prevent alert floods through grouping and deduplication at the provider,
not by discarding application failures.

## Local verification evidence

- TypeScript, zero-warning ESLint, Prisma schema validation, and production build pass.
- All 37 Jest suites and 259 tests pass with the critical-module coverage gate; measured
  coverage is 32.26% statements, 27.41% branches, 24.34% functions, and 32.97% lines.
- All five Chromium smoke/security tests pass.
- Next.js MCP reports zero compilation, configuration, or browser-session errors and lists
  the internal metrics route in the live App Router map.
- A real browser received the liveness JSON successfully. A fixed UUID round-tripped through
  `x-request-id`; invalid ids are replaced by tests.
- Runtime metrics reject an anonymous scrape with HTTP 401 and return HTTP 200 with the
  temporary test credential. `ticketing_ready` is correctly 0 on this workstation because
  production configuration and its migrated database are intentionally absent.
- Production dependency audit reports zero findings and `git diff --check` passes.

Docker is not installed on this workstation. The phase 8 container job therefore remains
the authoritative image build, vulnerability scan, migration, readiness, and authenticated
metrics smoke gate.

## Incident response

1. Acknowledge the alert, record incident start, affected environment/version, and operator.
2. Confirm impact through ingress signals, `ticketing_ready`, health endpoints, database and
   storage/scanner telemetry. Do not test with real user credentials.
3. Correlate using release and request ids. Restrict access to logs/audit data and avoid
   copying sensitive records into chat or tickets.
4. Contain: stop rollout, remove an unhealthy replica, disable a failing maintenance job,
   or roll back the application image by immutable digest according to phase 8. Never
   reverse a production migration automatically.
5. Recover and run liveness, readiness, authentication, authorization, attachment, and
   audit smoke checks. Confirm queues/backlogs are draining.
6. Preserve timestamps, release/image digests, migration state, relevant sanitized logs,
   alerts, and actions. Rotate any credential suspected of exposure.
7. Complete a blameless review with root cause, detection gap, user impact, corrective
   owner/deadline, and a regression test or runbook improvement.

## CI and rollout gates

The container job now verifies that unauthenticated metrics access returns 401 and an
authenticated scrape reports `ticketing_ready 1`. Unit tests cover token validation,
constant-time authentication behavior, Prometheus rendering, log redaction, request-id
propagation, and reserved-field protection.

Production remains blocked until the monitoring/logging provider is selected, private
scraping and structured-log ingestion are configured, dashboards and alert routes are
tested, retention/access controls are approved, and at least one staging incident exercise
successfully follows this runbook. Phase 9 did not apply migrations. The local database was
later reconciled on 2026-09-13, while all phase 8 staging gates remain required.
