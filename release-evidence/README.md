# Release evidence directory

Store only reviewed, non-secret Go-Live evidence manifests here. A manifest must be named
`release-evidence/<full-lowercase-commit-sha>.json`, be reviewed through a pull request, and
refer only to permanent HTTPS evidence records without credentials, signed query strings,
personal data, raw logs, database snapshots, or attachment contents.

The schema and required gate identifiers are documented in
`docs/product-refactor/phase-r12-production-cutover.md`. Validate a completed manifest with:

```bash
EXPECTED_RELEASE_ID=<full-lowercase-commit-sha> \
GO_LIVE_EVIDENCE_PATH=release-evidence/<full-lowercase-commit-sha>.json \
npm run verify:go-live-evidence
```

Do not add a placeholder JSON file: incomplete evidence must remain visibly absent and must
not be mistaken for an approved release.

Commit a completed package in a separate evidence revision that descends from the release
candidate. This preserves the application release SHA while approvals are collected after the
artifact is built.
