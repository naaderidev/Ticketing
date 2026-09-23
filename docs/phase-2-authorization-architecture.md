# Phase 2 — Authorization Architecture

Status: complete

Recorded: 2026-09-12

## Implemented architecture

Authorization is split into four explicit responsibilities:

1. `auth-token.ts` signs and verifies token data without depending on request APIs.
2. `current-user.ts` is the data-access boundary that resolves the authenticated identity to the current MySQL user and role.
3. `authorization-policy.ts` contains pure, testable resource permission rules.
4. `api-authorization.ts` combines the current user, resource lookup, policy decision, and safe HTTP denial response.

Route handlers still call authorization directly. The proxy is only an early redirect/rejection layer and cannot grant access to data.

## Next.js 16 proxy migration

- Replaced the deprecated `src/middleware.ts` convention with `src/proxy.ts`.
- Exported the required named `proxy` function.
- Preserved explicit static matchers.
- Changed path-prefix checks so `/api/tickets-public` cannot accidentally match `/api/tickets`.
- Removed proxy role decisions that could become stale after a database role change.
- Added a database-backed role check to the admin layout.

## Central permission policy

Ticket permissions are modeled as `read`, `reply`, `close`, `manage`, `delete`, and `rate`.

- ADMIN: read, reply, close, manage, and delete.
- Ticket owner: read, reply, close, and rate.
- Non-owner USER: no ticket permission.
- ADMIN cannot rate a ticket.

Notification permissions are also centralized by current role, recipient type, and ownership.

The complete enforced matrix is documented in `docs/access-control-matrix.md`.

## Defense in depth

- Proxy: optimistic authentication and user-facing redirects.
- Admin layout: current database role verification for admin pages.
- Route handler: mandatory API authorization.
- Resource policy: ownership and action-level permission.
- Database query: current identity and role, independent of JWT role freshness.

## Verification

| Check | Result |
| --- | --- |
| TypeScript | Pass |
| Jest | Pass: 13 suites, 133 tests |
| Authorization matrix tests | Pass |
| Current-user DAL tests | Pass |
| Route-prefix policy tests | Pass |
| Deprecated middleware convention | Removed |

The production build still cannot download the Google-hosted Vazirmatn font in the current restricted environment. The middleware deprecation warning no longer appears before that independent font failure.

## Scope intentionally deferred

- Request and query schemas, strict unknown-field rejection, and typed API errors: phase 3.
- Transaction boundaries and database invariants: phase 4.
- Attachment-level authorization and private file delivery: phase 5.
- Database-backed revocable sessions, rate limiting, and audit events: phase 6.
