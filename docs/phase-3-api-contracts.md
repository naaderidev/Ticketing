# Phase 3 — API Contracts and Input Validation

Status: complete

Recorded: 2026-09-12

## Implemented boundary architecture

All JSON-consuming API handlers now parse untrusted input through `parseJsonBody` and a strict Zod schema before calling a service. Malformed JSON, invalid types, out-of-range values, missing fields, and unknown fields are rejected with HTTP 400.

The API boundary also provides:

- strict parsing for ticket, FAQ, and notification query strings;
- rejection of duplicate query parameters;
- bounded ticket pagination (`page >= 1`, `1 <= limit <= 1000`);
- positive safe-integer parsing for numeric route parameters;
- conservative validation for ticket identifiers;
- validation and normalization of trimmed text;
- validated Jalali date shapes and calendar day/month ranges;
- strict attachment metadata and a maximum of 10 attachments per ticket or reply;
- strict multipart upload fields and a real `File` requirement.

## Stable error contract

Existing clients remain compatible because `error` is still a human-readable string. Responses now also expose a stable machine-readable `code`:

```json
{
  "error": "نام دپارتمان الزامی است",
  "code": "INVALID_REQUEST",
  "details": {
    "fieldErrors": {
      "name": ["نام دپارتمان الزامی است"]
    }
  }
}
```

Supported codes are:

- `INVALID_REQUEST`
- `MALFORMED_JSON`
- `INVALID_PATH_PARAMETER`
- `NOT_FOUND`
- `CONFLICT`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `INTERNAL_ERROR`

Known domain errors are mapped by exact identity instead of fragile word matching. Unexpected exceptions are logged server-side and returned with the route-specific fallback message; internal exception messages are not exposed to the client.

## Identity fields removed from client input

The ticket and reply clients no longer send `userName`, `senderName`, `senderType`, or `closedBy`. These values are derived from the current authenticated user at the server boundary. A client that attempts to submit these fields receives `INVALID_REQUEST`.

Notification clients also no longer send `userId`; notification ownership is derived from the authenticated user.

## Verification

| Check | Result |
| --- | --- |
| TypeScript | Pass |
| Jest | Pass: 14 suites, 146 tests |
| ESLint | Pass with 23 pre-existing warnings and zero errors |
| Prisma schema | Pass |
| Diff whitespace validation | Pass |
| Production build | Blocked only by the unavailable Google-hosted Vazirmatn font |

Runtime verification through the `next-dev-loop` workflow could not run because the required `agent-browser` executable is not installed. No substitute browser probe was used because that workflow requires both the browser and Next.js MCP views.

## Scope intentionally deferred

- database transactions, relational invariants, and typed service/domain errors: phase 4;
- private attachment storage, content verification, and authorized delivery: phase 5;
- revocable sessions, rate limiting, CSRF review, and audit events: phase 6;
- broader integration/E2E coverage and warning cleanup: later quality phases.
