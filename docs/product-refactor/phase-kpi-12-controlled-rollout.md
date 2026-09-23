# فاز KPI-12 — انتشار کنترل‌شده Reporting

وضعیت Repository: Completed

وضعیت Production: `HOLD` تا زمان تنظیم محیط واقعی و اجرای Workflow محافظت‌شده

نسخه قرارداد: `KPI-V1`

## هدف

جلوگیری از روشن‌شدن یک‌باره Reporting و تبدیل rollout به state machine صریح، قابل مشاهده و
قابل rollback. این فاز ابزار زیرساخت را حدس نمی‌زند و هیچ deploy یا تغییر خودکار Feature Flag در
Production انجام نمی‌دهد؛ پس از تغییر کنترل‌شده تنظیمات توسط مالک Release، همان وضعیت را با چند
مشاهده مستقل تأیید می‌کند.

## مراحل مجاز

| مرحله | Projection | API/UI | مخاطب |
| --- | --- | --- | --- |
| `DISABLED` | خاموش | خاموش | هیچ‌کس |
| `SHADOW` | روشن | خاموش | فقط پردازش و تطبیق داخلی |
| `CANARY` | روشن | روشن | فقط User IDهای allowlist و دارای Permission |
| `GENERAL` | روشن | روشن | تمام دارندگان Permission واقعی Reporting |

Promotion فقط یک مرحله رو به جلو مجاز است. Same-stage verification و rollback به هر مرحله پایین‌تر
مجاز است. پرش مستقیم `DISABLED → CANARY/GENERAL` یا `SHADOW → GENERAL` توسط verifier رد می‌شود.

## کنترل پیکربندی

- `REPORTING_ROLLOUT_STAGE` در Production بدون مقدار به `DISABLED` fail-closed می‌شود.
- در `CANARY`، متغیر `REPORTING_CANARY_USER_IDS` اجباری، یکتا، عددی و حداکثر ۱۰۰ عضو است.
- allowlist خارج از `CANARY` رد می‌شود تا دسترسی stale باقی نماند.
- `FEATURE_REPORTING_PROJECTION_ENABLED` و `FEATURE_REPORTING_API_ENABLED` باید دقیقاً با مرحله
  متناظر باشند؛ ترکیب ناسازگار startup/readiness را Fail می‌کند.
- Canary جایگزین Permission نیست. کاربر باید هم در allowlist باشد و هم Grant گزارش معتبر داشته
  باشد. پاسخ برای کاربر خارج cohort به‌شکل `404` است.

## Readiness و Observability

Endpoint خصوصی `GET /api/internal/reporting/readiness` با Bearer مستقل Reporting موارد زیر را بدون
PII منتشر می‌کند:

- مرحله و وضعیت واقعی Projection/API؛
- فقط تعداد اعضای Canary، نه شناسه آن‌ها؛
- نتیجه Reconciliation، checkpoint، Countها، blockerها و warningها.

Metrics زیر اضافه شده‌اند:

- `ticketing_reporting_rollout_stage{stage="..."}`
- `ticketing_reporting_projection_enabled`
- `ticketing_reporting_api_enabled`

## Verifier انتشار

`scripts/check-reporting-controlled-rollout.mjs` در هر observation این موارد را کنترل می‌کند:

1. readiness عمومی؛
2. SHA دقیق build و stage/flagها در Metrics؛
3. `ready=true`، صفر blocker، checkpoint سالم، نبود Lease و برابری source/processed؛
4. وجود حداقل یک Actor در Canary و نبود allowlist stale در سایر مراحل؛
5. `401` بودن maintenance endpoint بدون Token؛
6. `404` بودن API در Disabled/Shadow و `401` بودن آن بدون Session در Canary/General.

هر failure بلافاصله observation را قطع و تصمیم `HOLD` ایجاد می‌کند. موفقیت، بسته به جهت تغییر، یکی
از `ADVANCE_APPROVED`، `STAGE_VERIFIED` یا `ROLLBACK_VERIFIED` است. Tokenها در report یا error
ذخیره نمی‌شوند.

## Workflow محافظت‌شده

Workflow `Reporting Controlled Rollout Verification` فقط revision دقیق Release را checkout می‌کند،
از Environment محافظت‌شده `production-observation` و Secretهای مستقل استفاده می‌کند و artifact
پاک‌سازی‌شده را ۹۰ روز نگه می‌دارد. Workflow هیچ Flag، Replica، Migration یا Trafficی را تغییر
نمی‌دهد.

## ترتیب اجرای Production

1. شروع از `DISABLED` و تأیید Phase 11؛
2. تغییر به `SHADOW` با Projection روشن و API خاموش؛
3. اجرای حداقل سه observation و ادامه پردازش incremental؛
4. در صورت صفر blocker، تغییر به `CANARY` با یک یا چند مدیر گزارش مشخص؛
5. بررسی authorization، Export، latency و warningهای داده؛
6. پس از window مصوب، تغییر به `GENERAL`؛
7. در هر Stop Condition، بازگشت مرحله‌ای یا مستقیم به `DISABLED` و اجرای verifier rollback.

## Stop Conditions

- mismatch نسخه Release یا stage/flag؛
- readiness ناموفق؛
- checkpoint غیر `HEALTHY`، Lease گیرکرده یا failure؛
- اختلاف source/processed یا هر blocker Reconciliation؛
- Canary خالی یا دسترسی کاربر خارج allowlist؛
- maintenance endpoint بدون Token؛
- خطای Authorization، نشت PII، یا پاسخ غیرمنتظره API.

## وضعیت اجرای این فاز

State machine، Canary enforcement، endpoint خصوصی، Metrics، verifier، تست‌ها، قرارداد Release و
Workflow CI/Production پیاده شده‌اند. Production عمداً `HOLD` است، چون URL، Secretهای محیط، SHA
منتشرشده و تأیید مالک زیرساخت در workspace لوکال موجود نیستند؛ هیچ Evidence یا deploy جعلی تولید
نشده است.
