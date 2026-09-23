# Phase 11 — Staging Rehearsal and Operational Acceptance

## Scope

Phase 11 adds a repeatable, read-only acceptance gate for an already deployed staging
release. It does not deploy an image, change infrastructure, apply migrations, create users,
or mutate application data.

This separation is deliberate: deployment and database changes require a selected provider,
real credentials, an approved change window, and named owners. Those inputs do not exist in
the repository and must not be invented by automation.

## What the verifier proves

For one HTTPS staging origin and one expected immutable release identifier, the verifier
checks:

- liveness returns HTTP 200 and `{ "status": "ok" }`;
- readiness returns HTTP 200 and `{ "status": "ready" }`;
- cache prevention and request-ID propagation are active;
- HSTS, CSP, frame, content-type, referrer, opener, and permissions policies are present;
- the landing page returns the real RTL HTML application shell without stale caching;
- the framework is not exposed through `x-powered-by`;
- the metrics endpoint returns 401 without its dedicated credential;
- repeated authenticated metrics samples use Prometheus text format, report
  `ticketing_ready 1`, and all identify the exact expected full Git commit SHA;
- read-only GET probes cannot execute either SLA or ticket-lifecycle maintenance endpoint.

All requests use GET, have a bounded timeout, do not follow redirects, and refuse response
bodies larger than 128 KiB. Reports never contain the metrics token.

## GitHub environment setup

Create a protected GitHub environment named `staging` and configure:

| Name | GitHub type | Requirement |
| --- | --- | --- |
| `STAGING_BASE_URL` | Environment variable | HTTPS application origin with no path, query, fragment, or embedded credentials |
| `STAGING_METRICS_TOKEN` | Environment secret | The dedicated staging metrics credential, 32–512 visible ASCII characters |
| `STAGING_RELEASE_SAMPLE_COUNT` | Workflow value | 3–20 release samples; fixed to 5 by the protected workflow |

Configure required reviewers for the environment. Do not store either value in the workflow,
repository, CI artifact, or command line.

## Execution

After deploying a reviewed image digest to staging, manually run the **Staging Rehearsal**
workflow and enter the exact immutable release identifier used at image build time.

For an operator-controlled shell, the equivalent command is:

```bash
STAGING_BASE_URL=https://staging.example.com \
STAGING_METRICS_TOKEN='<secret>' \
EXPECTED_DEPLOYMENT_VERSION='<immutable-release-id>' \
npm run verify:staging
```

Do not paste the command with a real secret into tickets, chat, shell history, or CI logs.
Prefer secret-store injection. `STAGING_REQUEST_TIMEOUT_MS` may be set from 1000 to 30000;
the default is 10000. `STAGING_RELEASE_SAMPLE_COUNT` may be 3–20 and defaults to 5.

The workflow uploads `staging-rehearsal.json` even when verification fails, retains it for 30
days, and keeps the job failed when any acceptance check fails.

## Acceptance rule

The phase 11 repository implementation is complete when its unit tests and release contract
pass. A specific release is accepted for production consideration only when:

1. the protected workflow was approved and executed against production-equivalent staging;
2. all seven runtime checks have status `pass`;
3. the evidence artifact identifies the reviewed immutable release;
4. the database restore/migration rehearsal, private storage, malware scan, alert routing,
   capacity test, and rollback drill from phase 10 also have separate evidence;
5. named database, security, infrastructure, on-call, and release owners sign off.

## Failure handling

- Do not waive or rerun a failed check until the cause is understood.
- A release mismatch is a No-Go and usually indicates a stale replica, tag reuse, or mixed
  rolling deployment.
- A mismatch in even one repeated metrics sample is a No-Go.
- A readiness or `ticketing_ready` failure is a No-Go even when liveness is healthy.
- A redirect is a No-Go because it can hide routing mistakes and could expose credentials.
- Missing security headers or publicly accessible metrics are a security No-Go.
- Preserve the failed evidence artifact and correlate its request IDs with structured logs.

## Remaining external work

Phase 11 cannot be executed against a real staging environment until the owner supplies and
configures the environment, provider, URL, credentials, image registry, MySQL, object storage,
malware scanner, monitoring route, and approval policy. No migration was applied to the
current database during this phase.
