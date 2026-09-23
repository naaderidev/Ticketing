# Phase 1 — Critical Security Hardening

Status: implementation complete; production secret provisioning remains an operator action

Recorded: 2026-09-12

## Completed controls

### JWT configuration

- Removed the known fallback JWT signing secret.
- Reject missing, short, and known placeholder secrets.
- Validate the JWT payload shape before treating it as an authenticated identity.
- Read identity only from the signed authentication cookie; inbound `x-user-*` headers are not trusted.
- Use the current database role for authorization and token refresh.
- Reject sessions whose user no longer exists.

All previously issued tokens must be considered invalid. Every environment must receive a new, unique `JWT_SECRET` with at least 32 cryptographically random characters before it is started.

### Route authorization

- Added a shared server-side authorization boundary.
- Added database-backed `requireAuthenticatedUser` and `requireAdmin` checks.
- Added ticket ownership checks that return 404 for resources owned by another user.
- Added notification ownership checks.
- Protected sub-department routes in the request matcher and inside route handlers.
- Restricted department, sub-department, FAQ, predefined-message, and user-management mutations to administrators.
- Restricted predefined-message reads to administrators.
- Restricted ticket deletion and transfer/update operations to the intended roles.
- Allowed a ticket owner to close their own ticket while preventing other state changes.
- Restricted rating to the ticket owner and denied administrator ratings.

### Trusted identity

- Ticket owner names are derived from the authenticated database user.
- Reply sender type and sender name are derived from the authenticated database user.
- Client-provided sender identity is no longer authoritative.
- User notification queries and read operations derive ownership from the authenticated user instead of query parameters.

### Signup and login

- Moved public signup to `POST /api/users/signup`.
- Kept `/api/users` behind administrator authorization.
- Public signup always creates the `USER` role.
- Login now returns one generic response for an unknown mobile number or invalid password.
- A dummy bcrypt comparison reduces account-enumeration timing differences.

### Seed safety

- Removed committed sample identities and fixed passwords.
- The administrator seed now requires explicit environment values.
- The seed rejects passwords shorter than 12 characters.
- The development seed refuses to run when `NODE_ENV=production`.

## Verification results

| Check | Result |
| --- | --- |
| TypeScript | Pass |
| Jest | Pass: 9 suites, 86 tests |
| ESLint | Pass with 23 pre-existing warnings and zero errors |
| Route guard inventory | Every non-public API route contains a server-side authorization guard |
| Diff whitespace validation | Pass |

New security tests cover:

- missing and placeholder JWT secrets
- administrator role verification against current database state
- ticket ownership denial
- notification ownership denial
- denied administrative department mutation
- denied unauthorized ticket reads and state changes
- administrator-only ticket deletion
- deriving reply identity from the authenticated user

## Required operator action

Before local, staging, or production startup, create a different random JWT secret for each environment and store it outside Git. Do not copy the placeholder from `.env.example`.

Example secret-generation approach:

```text
Generate at least 32 cryptographically random bytes and encode them as Base64.
```

Do not paste real secrets into issue trackers, pull requests, logs, screenshots, or documentation.

## Deferred risks tracked by later phases

Phase 1 closes the known critical identity and authorization gaps. The following production blockers intentionally remain assigned to later phases:

- strict request/query validation and standardized API errors
- transactional multi-step database operations
- private object storage and content-based file inspection
- login/signup rate limiting and stronger password policy
- revocable database-backed sessions and audit logs
- comprehensive integration, end-to-end, and security testing
- clean production build without a network-fetched font
- CI/CD, monitoring, backup rehearsal, and deployment runbooks

The application is safer after this phase but is not approved for public production deployment yet.
