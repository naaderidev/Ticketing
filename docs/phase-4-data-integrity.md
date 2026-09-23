# Phase 4 — Data Integrity and Transactions

Status: complete

Recorded: 2026-09-12

## Local database reconciliation update — 2026-09-13

The populated local database had been created with `prisma db push` and contained no Prisma
migration history. Before reconciliation, a native MySQL dump was created and restored into
an isolated temporary database; all table row counts matched. The temporary restore database
was then removed.

Migration `20260912110000_align_legacy_schema` now completes the historical migration chain
for fresh databases by adding the omitted `User.passwordHash` and `User.role` fields and the
persisted FAQ/predefined-message text limits.

The first six migrations were baselined only after a live-schema diff proved their state was
already present. The three later migrations were then applied. MySQL 8.4 rejects a `CHECK`
constraint on `TicketAttachment.ticketId` and `replyId` because both columns participate in
foreign keys with referential actions, so the exactly-one-parent invariant is enforced with
`BEFORE INSERT` and `BEFORE UPDATE` triggers instead. Both rejection paths were tested.

Final local evidence:

- all nine migrations are applied;
- Prisma reports no schema drift;
- the 11 existing users and all ticket/attachment data were preserved;
- a fresh empty database successfully applies all nine migrations with no final drift;
- successful login, authenticated `/api/users/me`, logout, rate limiting, sessions, and audit
  persistence were verified with a temporary user and then cleaned up.

This local reconciliation is not a substitute for the production backup and staging rehearsal
required by phases 10 and 11.

## Atomic business workflows

The write paths that span multiple records now run inside Prisma interactive transactions with `Serializable` isolation. Transaction conflicts (`P2034`) are retried at most three times with fixed bounds (`maxWait: 5000`, `timeout: 10000`).

The following operations are atomic:

- ticket creation together with its administrator and user notifications;
- ticket updates/transfers together with their notification;
- replies together with ticket status changes and notification creation;
- first-time ticket rating;
- FAQ creation and priority allocation;
- FAQ reordering.

Conditional updates protect rating and reply/close races. Reopening a ticket also clears its previous closure metadata (`closedAt`, `closedReason`, and `closedBy`).

## Domain and persistence errors

Services now throw typed domain errors for validation, missing records, and conflicts. Prisma persistence failures are translated explicitly:

- `P2002` becomes a conflict;
- `P2025` becomes not found;
- `P2003` becomes either a missing relation or a protected-relation conflict, according to the operation.

The API layer maps these domain error kinds to the stable HTTP 400/404/409 contract. Unexpected errors remain private and are logged server-side.

## Relational invariants

- A ticket's sub-department must belong to its department when the ticket is created or transferred.
- FAQ creation enforces the same department/sub-department relationship.
- FAQ reorder input rejects duplicate FAQ IDs and duplicate priorities and verifies that every target exists.
- Deleting a department or sub-department can no longer cascade-delete tickets. The database foreign keys use `RESTRICT`.
- Composite indexes were added for ticket lists, FAQ ordering, and notification inbox queries.

## Migration deployment safety

The reviewed migration is checked in at `prisma/migrations/20260912120000_protect_ticket_relations/migration.sql`, but it has **not** been applied automatically.

`prisma migrate status` currently reports every repository migration as unapplied for the configured database. This can mean the database was initialized with `prisma db push`, points to a fresh database, or has migration history that is not represented in `_prisma_migrations`. Running `prisma migrate deploy` blindly against an existing populated schema may therefore fail or create an unsafe rollout.

Before production deployment:

1. Take and restore-test a database backup.
2. Confirm that the target `DATABASE_URL` points to the intended staging database.
3. Inspect the target schema and `_prisma_migrations` history.
4. If tables already exist without migration history, baseline the existing migrations using Prisma's documented `migrate resolve --applied` workflow; do not recreate production tables.
5. Run `npx prisma migrate deploy` on staging and verify ticket, reply, rating, FAQ reorder, and protected deletion scenarios.
6. Repeat the reviewed deployment against production during a controlled release window.

Production deployment must continue to use migrations and must not use `prisma db push`.

## Verification

| Check | Result |
| --- | --- |
| TypeScript | Pass |
| Jest | Pass: 18 suites, 161 tests |
| ESLint | Pass with 23 pre-existing warnings and zero errors |
| Prisma schema | Pass |
| Diff whitespace validation | Pass |
| Migration status | Migration file ready; database application intentionally deferred |

The production build remains blocked in this environment only by the unavailable Google-hosted Vazirmatn font. Runtime verification through `next-dev-loop` also remains unavailable because the required `agent-browser` executable is not installed.

## Scope intentionally deferred

- private attachment storage, file signature/content verification, ownership checks, and authorized download delivery: phase 5;
- revocable sessions, rate limiting, CSRF review, and audit events: phase 6;
- removal of the 23 existing lint warnings and full browser E2E coverage: later quality phases.
