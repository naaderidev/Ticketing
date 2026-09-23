# Legacy retirement evidence directory

Store only reviewed, non-secret retirement manifests here. Each manifest must be named
`legacy-retirement/<full-lowercase-release-commit-sha>.json` and committed in a revision that
descends from the approved R14 closure revision.

The package contains permanent HTTPS references only. Never store credentials, signed URLs, PII,
raw traffic logs, database snapshots, ticket contents, attachments, or copied incident records.

Validate a complete manifest with environment-injected values:

```bash
EXPECTED_RELEASE_ID=<full-release-sha> \
EXPECTED_CLOSURE_REVISION=<full-closure-sha> \
LEGACY_RETIREMENT_EVIDENCE_PATH=legacy-retirement/<full-release-sha>.json \
npm run verify:legacy-retirement
```

Do not add placeholders. A missing or incomplete package must remain `KEEP_LEGACY`. Approval from
this verifier authorizes a separate reviewed removal change; it never deletes Legacy code or data.
