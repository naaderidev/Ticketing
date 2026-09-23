## Change summary

Describe the user-visible and operational impact of this change.

## Verification

- [ ] `npm run verify:demo`
- [ ] Demo account and reporting Seed checks pass
- [ ] Lint, type-check, tests and production-demo build pass

## Production safety

- [ ] No secret, credential, personal data, or production database snapshot is included
- [ ] Authorization, rate-limit, attachment, logging, and metrics boundaries remain intact
- [ ] New or changed environment variables are documented in `.env.example`
- [ ] Prisma schema and destructive demo bootstrap implications were reviewed
- [ ] Backup/restore and rollback implications are documented
- [ ] Monitoring, alerting, and runbook impact is documented
- [ ] SLA and ticket-lifecycle scheduler impact is documented and fail-closed

## Release decision

- [ ] A second reviewer approved security- or data-sensitive changes
- [ ] No real customer data, uploaded attachment or local `.env` file is included
- [ ] The target host, port and `APP_ORIGIN` are documented
