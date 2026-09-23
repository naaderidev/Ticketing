# Phase 5 — Private Attachments

Status: implementation complete; infrastructure rollout pending

Recorded: 2026-09-12

## Security architecture

New files are no longer written to `public/uploads`. The upload path now:

1. requires a current database-backed user;
2. rejects oversized multipart requests before parsing when `Content-Length` is present;
3. limits each file to 5 MiB and each ticket/reply to 10 files;
4. normalizes the original name and rejects path/control characters;
5. determines the media type from the file extension and binary signature instead of trusting browser metadata;
6. requires a clean ClamAV result in production;
7. calculates a SHA-256 checksum;
8. writes the object to a private S3-compatible bucket with server-side encryption;
9. records an expiring, opaque upload reference owned by the authenticated uploader.

Local development may explicitly use `ATTACHMENT_STORAGE_DRIVER=filesystem`. That
adapter writes only below a private, non-public directory and is rejected in production;
the production architecture and rollout continue to require private S3-compatible storage.

Ticket and reply APIs accept only `{ "uploadId": "..." }`. Client-supplied names, sizes, types, and URLs are rejected. Pending uploads are claimed inside the same serializable transaction that creates the ticket or reply. A reference cannot be claimed after expiry, by a different user, or more than once.

## Authorized delivery

The API returns attachment URLs in the form `/api/attachments/{id}`. Every download:

- authenticates the current database user;
- resolves the parent ticket, including reply attachments;
- applies the ticket-level read policy;
- returns 404 for missing and unauthorized resources to avoid ID disclosure;
- reads from private storage only after authorization;
- verifies stored size and SHA-256 when available;
- forces download with `Content-Disposition` and sends `nosniff`, `sandbox`, private/no-store headers.

Direct `/uploads/*` requests are blocked by the Next.js proxy. Existing repository files were deliberately not deleted, so legacy records remain recoverable during migration.
Legacy content is re-inspected and malware-scanned before each authorized delivery until it has been migrated to verified private storage.

## Cleanup and retention

- A user can delete only their own pending upload.
- Pending uploads expire after 24 hours by default.
- Expired uploads transition to `DELETING` before object deletion, preventing a concurrent claim.
- Ticket deletion writes object references to `AttachmentDeletionJob` in the same database transaction before cascading database records.
- Object deletion is idempotent and failed jobs remain queued with an attempt count and error context.
- `/api/internal/attachments/cleanup` processes bounded batches and requires a separate bearer credential compared in constant time.
- Upload requests also process small cleanup batches opportunistically.

Production must schedule the cleanup endpoint regularly using `ATTACHMENT_CLEANUP_TOKEN`. The token must contain at least 32 random characters and must not be a user session or `JWT_SECRET`.

## Legacy migration

`/api/internal/attachments/migrate-legacy` migrates at most 25 legacy files per authenticated maintenance call. Each file is re-inspected, malware-scanned, checksummed, uploaded privately, and then switched to the S3 storage key with a conditional database update. Local deletion is queued only after the database update succeeds.

Call the endpoint repeatedly until `remaining` is zero, then run cleanup until both failure counts are zero. Do not remove `public/uploads` before those conditions are met and a restore test has succeeded.

## Required production configuration

The complete variable list is in `.env.example`. Production additionally requires:

- a private bucket with public access blocked at account and bucket level;
- TLS for the S3-compatible endpoint;
- a least-privilege workload identity limited to the attachment bucket (or both explicit credential variables when workload identity is unavailable);
- bucket encryption and backup/versioning according to the retention policy;
- a reachable, updated ClamAV service;
- `ATTACHMENT_SCAN_MODE=clamav` (the application refuses disabled scanning in production);
- an ingress/reverse-proxy request-body limit close to 6 MiB because omitted or dishonest `Content-Length` headers cannot be bounded before `Request.formData()` buffers the multipart body;
- a scheduled POST to the cleanup endpoint with the maintenance bearer token.
- MySQL 8.0.16 or newer so the exactly-one-parent `CHECK` constraint is enforced.

## Safe rollout order

The currently configured database reports all seven repository migrations as unapplied,
including the phase 4 and phase 5 migrations. No migration was applied automatically.
Resolve or baseline that history before deploying this application revision.

1. Provision the private bucket and ClamAV and verify them without production data.
2. Back up the database and restore it in staging.
3. Confirm every existing `TicketAttachment` has exactly one parent before adding the database check constraint.
4. Reconcile the existing Prisma migration history as described in phase 4.
5. Apply `20260912130000_private_attachments` in staging with `prisma migrate deploy`.
6. Deploy the application configuration and run authorized/unauthorized upload and download smoke tests.
7. Migrate legacy attachments in bounded batches and monitor failures.
8. Exercise ticket deletion and scheduled cleanup, then confirm the deletion queue drains.
9. Repeat the reviewed process in production. Keep the backup and legacy files until post-release verification is complete.

## Verification

| Check | Result |
| --- | --- |
| TypeScript | Pass |
| Jest | Pass: 22 suites, 182 tests |
| ESLint | Pass with 23 existing warnings and zero errors |
| Prisma schema | Pass |
| Diff whitespace validation | Pass |
| Dependency audit | Pass: zero reported vulnerabilities after installing the official S3 client |
| Next.js runtime compilation | Pass: all routes compiled with no reported issues |
| Browser security probes | Pass: anonymous private download returned 401 and direct legacy URL returned 404 |
| Production build | Blocked only by the unavailable Google-hosted Vazirmatn font |
| Live S3/ClamAV integration | Pending infrastructure configuration |

The implementation follows the repository's private S3-compatible storage decision and keeps filesystem, scanner, storage, persistence, and transport responsibilities separated. The Next.js MCP and an isolated `agent-browser` session reported no runtime or compilation errors for the exercised routes. Authenticated end-to-end upload/download remains an infrastructure acceptance test because no S3-compatible bucket or ClamAV instance is configured in this workspace.

## Scope intentionally deferred

- request rate limiting and abuse controls across repeated ticket creation: completed in phase 6;
- revocable sessions, CSRF review, and security audit logging for attachment maintenance operations: completed in phase 6;
- provider-specific bucket policy, monitoring alerts, disaster-recovery exercises, and infrastructure-as-code: deployment/operations phase.
