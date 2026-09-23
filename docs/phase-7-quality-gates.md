# Phase 7 — Quality Gates and Release Verification

Status: implementation complete; repository-hosted CI execution and staging acceptance pending

Recorded: 2026-09-12

## Scope

This phase converts the earlier one-off checks into repeatable release gates. It removes
the existing lint-warning debt, adds coverage around previously untested service logic,
introduces browser-level security smoke tests, and defines a GitHub Actions workflow that
must pass before a production release can proceed.

## Static quality gates

- ESLint now fails on any warning through `--max-warnings=0`; the 23 existing warnings
  were resolved and unused variables are errors.
- TypeScript has a dedicated non-incremental `npm run typecheck` command.
- Node.js is pinned to 24.21.0 in `.nvmrc`; `package.json` constrains Node and npm to the
  same production major versions used by CI.
- The lockfile remains the only CI dependency source through `npm ci`.

The two existing React compiler lint exceptions remain explicit in the ESLint
configuration. Removing them safely requires a separate UI state-management refactor and
must not be hidden inside a release-gate change.

## Automated tests and coverage

The Jest suite now excludes Playwright specifications and contains dedicated service
tests for departments, predefined messages, notifications, and users. These tests isolate
Prisma and external boundaries while checking validation, conflicts, referential guards,
safe selections, role changes, and session revocation.

Coverage thresholds prevent regressions at three levels:

- all measured source: 30% statements/lines, 24% branches, 22% functions;
- `src/lib`: 60% statements/lines/functions and 45% branches;
- the core authorization, validation, token, CSRF, current-user, transaction, domain-error,
  and route-policy modules: 85% statements/lines, 65% branches, 90% functions.

The measured baseline after this phase is 30.42% statements, 24.72% branches, 22.44%
functions, and 30.96% lines. Thresholds are intentionally at or just below that verified
baseline so any regression fails immediately; future phases should only raise them.

## Browser and security smoke coverage

Playwright runs Chromium against an isolated development server and verifies:

1. the public landing page renders in Persian RTL and reaches the user login;
2. protected user pages redirect unauthenticated traffic with a local return path;
3. invalid login input is rejected before a network mutation;
4. same-origin unauthenticated mutations reach authorization while cross-origin mutations
   are rejected by CSRF protection;
5. framing, MIME-sniffing, referrer, and CSP response headers are present.

The landing page was also checked with axe-core. The heading-order violation was corrected
and the repeated browser audit now reports zero definite violations. Axe still marks five
text nodes for manual contrast review because their background is a CSS gradient. Their
computed foreground and worst-case rendered background colors were checked manually: the
lowest contrast is 6.07:1, above the WCAG AA 4.5:1 requirement for normal text.

Post-login redirects are now resolved through the shared route policy. External,
protocol-relative, malformed-backslash, JavaScript, and public-login destinations fall
back to the role dashboard, closing an open-redirect path.

## CI release gate

`.github/workflows/ci.yml` runs on pull requests, pushes to `main`, and manual dispatch.
It uses SHA-pinned actions and executes deterministic install, Prisma validation, lint,
type-checking, Jest with coverage thresholds, production dependency audit, Playwright,
and a production build. A separate TruffleHog job scans commit history for verified and
unknown credential leaks. Browser diagnostics are retained only after failures.

Repository branch protection must require both `Quality and browser gates` and
`Secret scan`; committing the workflow alone cannot enforce that repository setting.

## Remaining external release gates

This phase does not make production deployment safe by itself. Production remains blocked
until the migrations are reconciled and rehearsed in staging, live
S3-compatible storage and ClamAV acceptance tests pass, trusted-proxy behavior is verified,
backup restoration is rehearsed, operational alerts/retention are configured, and the
owner confirms the deployment provider and policies listed in `deployment-decisions.md`.

Authenticated end-to-end journeys require a disposable migrated test database and seeded
accounts. They belong in the staging acceptance suite; the current browser gate deliberately
avoids connecting CI to a real database or silently applying migrations.

## Verification

| Check | Result |
| --- | --- |
| ESLint | Pass: zero warnings and zero errors |
| TypeScript | Pass |
| Jest and coverage | Pass: 30 suites, 235 tests; global and critical thresholds enforced |
| Playwright | Pass: 5 Chromium smoke/security scenarios |
| Prisma schema | Pass |
| Production dependency audit | Pass: zero reported vulnerabilities |
| Production build | Pass: 36 static pages generated; standalone output completed |
| Next.js runtime | Pass: zero config, session, or compilation issues |
| Accessibility | Pass: zero axe violations; manual gradient contrast minimum 6.07:1 |
| Diff whitespace | Pass |

At phase 7 completion, the local database still reported all migrations as unapplied. The
local database was reconciled on 2026-09-13, but the production-equivalent staging rehearsal
described in phases 10 and 11 remains a release gate.
