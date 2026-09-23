# Phase 6 — Operational Security

Status: implementation complete; environment rollout and acceptance tests pending

Recorded: 2026-09-12

## Revocable sessions

Authentication now uses a signed, minimal JWT containing only a user id and a random
database session id. The server still verifies the JWT at the Next.js Proxy as an
optimistic check, but every protected data access resolves the session from MySQL and
requires it to be unexpired and not revoked.

- Login creates a separate session for each device/browser.
- Logout revokes that exact session before deleting the cookie.
- Refresh extends only an active session and rotates the signed cookie.
- Sliding refresh is capped by a 30-day absolute lifetime, so activity cannot keep a
  session alive forever.
- Role changes revoke every active session for the affected user in the same serializable
  transaction as the role update.
- The cookie is `HttpOnly`, `Secure` in production, `SameSite=Strict`, high priority, and
  scoped to `/`.
- JWT validation pins the `HS256` algorithm, issuer, and audience.
- Expired sessions and revoked sessions older than 30 days are removed by the maintenance
  cleanup job.

Deploying this phase intentionally invalidates every legacy stateless cookie. Users must
sign in again after rollout.

## Durable abuse controls

Rate limits use MySQL buckets rather than process memory, so they remain consistent across
multiple application instances and serverless invocations. Counters are incremented with
an atomic conditional update. A uniqueness race when creating a bucket is handled without
allowing an extra request.

| Scope | Limit | Window |
| --- | ---: | ---: |
| Login by source | 10 | 15 minutes |
| Login by mobile identity | 5 | 15 minutes |
| Signup by source | 5 | 1 hour |
| Signup by mobile/national-code identity | 3 | 1 hour |
| Authenticated mutations | 120 | 1 minute |
| Attachment uploads | 20 | 10 minutes |
| Authorized cleanup operation | 10 | 1 minute |
| Authorized legacy migration operation | 5 | 1 minute |

Rate-limited responses use HTTP 429, the stable `RATE_LIMITED` error code, `Retry-After`,
and `Cache-Control: no-store`. Raw IP addresses, mobile numbers, national codes, and user
ids are not stored in rate-limit buckets; identities are HMAC-pseudonymized with
`SECURITY_HASH_SECRET`.

The cleanup endpoint removes expired rate-limit buckets. Tune the listed limits from
observed production traffic only after alerting and dashboards exist; changing them by
guesswork can create either an abuse gap or a self-inflicted denial of service.

## CSRF and browser boundary

All non-internal API requests using `POST`, `PUT`, `PATCH`, or `DELETE` are rejected unless
their `Origin` exactly matches `APP_ORIGIN`. Requests marked `Sec-Fetch-Site: cross-site`
are rejected immediately. This is combined with `SameSite=Strict` authentication cookies.

The maintenance endpoints are deliberately excluded because they do not use browser
cookies; they require their dedicated bearer secret. Non-browser clients calling regular
mutation APIs must send the exact configured `Origin` header.

Global response headers now prevent MIME sniffing and framing, limit referrer data and
camera/microphone/geolocation access, isolate the opener, restrict form/base/object CSP
sources, and enable HSTS in production.

## Security audit trail

The append-only application path writes structured `AuditEvent` rows for authentication,
signup, administrator user creation/role changes, ticket creation/update/deletion,
attachment upload/removal, cleanup, and legacy migration. Events contain stable action and
outcome fields, actor/session/target identifiers when available, a request id, and a
pseudonymized source. Passwords, tokens, raw IP addresses, mobile numbers, national codes,
attachment names, and message bodies are never included.

Audit persistence is best-effort for actions that also involve external object storage;
a persistence failure emits a minimal structured server error without leaking secrets.
Production should forward server logs to an alerting sink and restrict direct database
update/delete permissions on `AuditEvent`. Define an audit retention/export policy before
go-live.

## Required production configuration

- `JWT_SECRET`: at least 32 random characters.
- `SECURITY_HASH_SECRET`: a different random secret with at least 32 characters.
- `APP_ORIGIN`: the single public HTTPS origin, with no path/query/fragment.
- `TRUSTED_PROXY_IP_HEADER`: one of `x-forwarded-for`, `x-real-ip`, or
  `cf-connecting-ip`. Configure it only when the trusted ingress overwrites that header and
  strips any client-supplied value.

`TRUSTED_PROXY_IP_HEADER` fails closed in production when missing or unsupported. Rotate
`SECURITY_HASH_SECRET` only with an explicit operational plan because rotation changes the
pseudonymous rate-limit and audit source identifiers.

## Safe rollout order

At phase 6 completion, the configured database reported all eight migrations then present as
unapplied, including `20260912140000_operational_security`. No migration was applied in that
phase. The populated local database was later backed up, restore-tested, baselined, and
reconciled on 2026-09-13 as recorded in `phase-4-data-integrity.md`.

1. Back up production and restore it in staging.
2. Reconcile the existing Prisma migration history; no migration is applied automatically.
3. Configure the four security variables and trusted ingress header behavior in staging.
4. Apply `20260912140000_operational_security` with `npx prisma migrate deploy`.
5. Deploy the application and confirm all legacy sessions require a fresh login.
6. Verify login/logout/replay, refresh, role-change revocation, 429/`Retry-After`, same-origin
   mutations, cross-origin rejection, and maintenance bearer authentication.
7. Confirm audit rows contain no credentials or direct personal identifiers and that audit
   persistence failures alert operators.
8. Load-test the default limits using representative traffic, then document any approved
   tuning.
9. Repeat the reviewed process in production and monitor authentication denials, rate-limit
   volume, audit-write failures, database latency, and maintenance failures.

## Deployment gates that remain external

Code-level controls cannot remove infrastructure and operational risk. Production remains
blocked until the full migration chain is reconciled and applied in staging, the trusted
proxy behavior is verified, S3/ClamAV acceptance tests from phase 5 pass, audit retention
and alerts are configured, and a database restore exercise succeeds.

## Verification

| Check | Result |
| --- | --- |
| TypeScript | Pass |
| Jest | Pass: 26 suites, 200 tests |
| ESLint | Pass with 23 pre-existing warnings and zero errors |
| Prisma schema | Pass |
| Diff whitespace validation | Pass |
| Runtime compilation | Pass: Next.js MCP reported zero compilation issues |
| Runtime errors | Pass: clean same-origin browser session reported no config/session errors |
| CSRF browser probes | Pass: same-origin unauthenticated POST reached auth and returned 401; cross-origin POST returned 403 |
| Security response headers | Pass: framing, MIME-sniffing, and referrer headers verified in Chromium |
| Production build | Pass: all 36 static pages generated and standalone build completed |
| Production dependency audit | Pass: zero reported vulnerabilities |

Vazirmatn is now bundled from `@fontsource-variable/vazirmatn`; production builds no longer
download font assets from Google.
