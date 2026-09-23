# Baseline معماری R1-v1

وضعیت: Approved

تاریخ: 2026-09-13

پیش‌نیاز: `R0-v1`

## اجزای Baseline

- نتیجه فاز: `phase-r1-architecture.md`
- معماری و ماژول‌ها: `architecture-and-modules.md`
- ADRها: `architecture-decisions.md`
- HTTP contract: `api-v2-contract.md`
- Domain/outbox events: `event-catalog.md`
- Migration/rollout: `migration-and-rollout.md`
- Threat model: `threat-model.md`

## تصمیم‌های قطعی

- Modular Monolith و عدم Microservice/CQRS/Event Sourcing در V1
- `/api/v2` برای قرارداد جدید و Compatibility Adapter برای API فعلی
- Command endpoint برای mutationهای معنادار
- Version/ETag و Idempotency برای عملیات حساس
- تفکیک TicketEvent، AuditEvent و OutboxEvent
- reference-only integration با منابع مالی/قرارداد/دارایی
- Expand/Backfill/Shadow/Dual-run/Canary/Cutover/Contract
- Authorization Context کاملاً سروری

## نتیجه ورود به R2

R2 مجاز است مدل Party/Organization/Membership/Role Assignment را فقط به‌صورت additive
طراحی و پیاده‌سازی کند. API فعلی و User/Session موجود تا پایان Migration حذف یا شکسته
نمی‌شوند. Cross-tenant test، audit مشاهده حساس و feature flag بخشی از Definition of Done
R2 هستند.
