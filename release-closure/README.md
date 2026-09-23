# Release closure evidence directory

Store only reviewed, non-secret closure manifests here. Each file must be named
`release-closure/<full-lowercase-release-commit-sha>.json` and committed in a closure revision
that descends from the approved Go-Live evidence revision.

The manifest contains permanent HTTPS references only. Never include credentials, signed URLs,
personal data, raw logs, database snapshots, customer attachments, or copied incident contents.

Validate a completed package with environment-injected values:

```bash
EXPECTED_RELEASE_ID=<full-release-sha> \
EXPECTED_GO_LIVE_EVIDENCE_REVISION=<full-evidence-sha> \
RELEASE_CLOSURE_EVIDENCE_PATH=release-closure/<full-release-sha>.json \
npm run verify:release-closure
```

Do not add a placeholder manifest. An absent or incomplete closure record must remain visibly
`KEEP_OPEN` until all three R13 checkpoints and external owner approvals exist.
