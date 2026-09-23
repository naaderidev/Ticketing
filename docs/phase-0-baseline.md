# Phase 0 — Baseline and Readiness Record

Recorded: 2026-09-12

This document captures the state of the repository before security hardening and production-readiness work begins. It is evidence, not a claim that the application is production-ready.

## Repository state

- Branch: `main`
- Baseline commit: `62f1ecc` (`Update Logo`)
- Pre-existing uncommitted files:
  - `src/app/page.tsx`
  - `src/components/shared/header.tsx`
- The pre-existing changes above must be preserved and kept separate from remediation work.
- Remote: `origin` points to `naaderidev/Ticketing` on GitHub.

## Runtime and primary stack

- Local Node.js: `24.11.1`
- Local npm: `11.14.1`
- Next.js: `16.3.4`
- React: `19.2.8`
- TypeScript: `5.9.3`
- Prisma Client/CLI: `5.22.0`
- Database provider: MySQL

The production Node.js version will be pinned when the deployment container and CI workflow are introduced. CI and production must use the same major version.

## Baseline verification

| Check | Command | Result |
| --- | --- | --- |
| Dependency tree | `npm ls --depth=0` | Pass |
| TypeScript | `npx tsc --noEmit --incremental false` | Pass |
| Prisma schema | `npx prisma validate` | Pass |
| Unit/component tests | `npx jest --runInBand` | Pass: 6 suites, 73 tests |
| Coverage | `npx jest --coverage --runInBand` | Pass, but total line coverage is 8.58% |
| ESLint | `npx eslint src` | Fail: 1 error and 24 warnings |
| Production build | `npm run build` | Not verified: Google Fonts download was unavailable |

The build also reports that the Next.js `middleware` convention is deprecated in favor of `proxy`. Both findings are tracked for later phases.

## Known release blockers

The application must not be exposed publicly until these blockers are resolved and tested:

1. JWT signing currently has a known fallback secret.
2. Authorization and resource ownership are not consistently enforced in route handlers.
3. Some sub-department mutations are outside the middleware matcher.
4. Public signup and the middleware route policy conflict.
5. Multi-step ticket operations are not transactional.
6. Uploaded files are stored under the application's public filesystem.
7. Security-sensitive code has little or no test coverage.
8. ESLint and a clean production build do not currently pass.

## Environment contract

The repository contains `.env.example` with placeholders only. Real values belong in the deployment platform's secret store and must never be committed.

Currently identified required values:

- `DATABASE_URL`: MySQL connection URL with a least-privilege application user.
- `JWT_SECRET`: cryptographically random signing secret. Phase 1 will make startup fail when it is missing or unsafe.

Planned values for later phases will cover object storage, rate limiting, logging, and the public application URL. They will only be added to `.env.example` when the application consumes and validates them.

## Change-control rules for subsequent phases

- Each phase should be implemented as a separate reviewable commit or pull request.
- Database migrations require a backup, restore test, staging rehearsal, and rollback/runbook notes.
- Security changes require negative tests, not only successful-path tests.
- No phase is complete while TypeScript, ESLint, tests, or the production build fails for a code-related reason.
- Existing user changes must not be overwritten or mixed into unrelated commits.
