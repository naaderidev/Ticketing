# فاز R6 — یکپارچه‌سازی مرجع‌های کسب‌وکار

وضعیت: زیرساخت فنی کامل — فعال‌سازی Provider واقعی `NO-GO` تا تکمیل قراردادهای بیرونی

تاریخ: 2026-09-13

پیش‌نیاز: Baseline `R5-v1`

## هدف و مرز فاز

R6 مرز امن و قابل‌آزمون میان Ticketing و منبع حقیقت Contract، Finance، Power Plant،
Meter و Saving Program را ایجاد می‌کند. این فاز هیچ داده مالی، وضعیت حقوقی یا محاسبه جاری
را در Ticketing به منبع حقیقت تبدیل نمی‌کند و هیچ endpoint/مالک نامعلومی را حدس نمی‌زند.

موضوع‌های بیرونی پشتیبانی‌شده در قرارداد عبارت‌اند از `CONTRACT`، `INVOICE`، `PAYMENT`،
`SETTLEMENT`، `POWER_PLANT`، `METER` و `SAVING_PROGRAM`. موضوع‌های
`ORGANIZATION_MEMBERSHIP` و `RELATED_TICKET` همچنان از مدل canonical محلی و در همان
transaction اعتبارسنجی می‌شوند.

## معماری و جریان ایجاد تیکت

1. Context فعال فقط از Session و Membership سمت سرور استخراج می‌شود.
2. idempotency receipt موفق، پیش از هر تماس Provider replay می‌شود.
3. RequestType فعال خوانده و نوع Reference ورودی با موضوع مصوب آن تطبیق داده می‌شود.
4. Provider خارج از transaction دیتابیس، با timeout محدود و context token فراخوانی می‌شود.
5. schema، نسخه قرارداد، context token، subject type، uniqueness و freshness پاسخ کنترل می‌شود.
6. transaction Serializable آغاز و Session، Membership، RequestType و Route دوباره کنترل می‌شوند.
7. فقط snapshot تأییدشده ذخیره و Ticket، Message، Assignment، SLA، Event، Outbox، Notification
   و idempotency receipt به‌صورت اتمیک commit می‌شوند.

بنابراین قطعی Provider یا پاسخ نامعتبر هیچ Ticket یا receipt نیمه‌کاره‌ای بر جا نمی‌گذارد و
هیچ network I/O در transaction انجام نمی‌شود. دو درخواست هم‌زمان با کلید یکسان ممکن است
هر دو read-only verification را انجام دهند، اما قید idempotency فقط یک Ticket را commit می‌کند.

## قرارداد Provider Gateway

Ticketing فقط دو عملیات `POST` با URL ثابت server-configured دارد:

- `v1/business-references/search` برای lookup محدود و scopeشده؛
- `v1/business-references/verify` برای تأیید نهایی شناسه‌های انتخاب‌شده.

هر درخواست شامل `requestId`، `subjectType`، شناسه Party/Organization، Scopeهای عضویت و یک
`contextToken` HMACشده است. پاسخ باید `contractVersion`، همان `contextToken`، همان
`subjectType` و حداکثر ۱۰۰ item strict داشته باشد. redirect غیرفعال است، پاسخ بیش از ۲۵۶KiB
رد می‌شود و URL از ورودی کاربر ساخته نمی‌شود.

طبقه‌بندی خطا:

| وضعیت | پاسخ Ticketing |
| --- | --- |
| timeout، خطای شبکه، 429 یا 5xx | `503 DEPENDENCY_UNAVAILABLE` |
| JSON/schema/version/context/type ناسازگار | `502 UPSTREAM_INVALID_RESPONSE` |
| شناسه ناقص، اضافه، تکراری یا خارج Scope | خطای عمومی 422 بدون افشای وجود داده |
| Flag خاموش در endpoint جست‌وجو | `404 NOT_FOUND` |

Retry خودکار برای verify انجام نمی‌شود؛ Provider باید read-only باشد، ولی تا زمان ثبت رسمی
قرارداد idempotency، retry پنهان مجاز نیست.

## مدل داده افزایشی و حداقل‌سازی داده

Migration `20260913140000_business_reference_integrations` ستون‌های nullable زیر را به
`TicketBusinessReference` اضافه می‌کند تا rollback اپلیکیشن R5 همچنان قابل اجرا باشد:

- `sourceSystem`، `entityType` و `externalId`؛
- `snapshotFetchedAt` و `snapshotExpiresAt` اختیاری؛
- `sourceVersion` و `sourceEtag` اختیاری.

Referenceهای موجود بدون حدس بیرونی با `TICKETING_LOCAL`، نوع/کلید موجود و `createdAt`
backfill می‌شوند. Snapshot فقط label نمایشی Mask‌شده و metadata فوق را نگه می‌دارد؛ مبلغ،
وضعیت جاری، اطلاعات هویتی یا payload خام Provider ذخیره نمی‌شود.

## API و امنیت

`GET /api/v2/business-subjects/{subjectType}?q=...&limit=...` برای جست‌وجوی authenticated
اضافه شده است. `q` بین ۲ تا ۱۰۰ نویسه، `limit` بین ۱ تا ۲۵ و subject type whitelist است.
endpoint هم به `support_v2_read` و هم Flag R6 وابسته، `private/no-store`، دارای rate limit
۶۰ درخواست در دقیقه برای هر User و Audit موفق/ناموفق بدون query یا external ID است.

پاسخ Provider فقط وقتی قابل استفاده است که برای همان Context صادر شده و `authorized=true`
باشد. Ticketing هیچ Party، Organization، Scope، source system یا URL ارسالی Client را قبول
نمی‌کند. خطاهای شبکه‌ای نیز token، host داخلی یا متن خام Provider را بازنشر نمی‌کنند.

## پیکربندی و Rollout

- `FEATURE_BUSINESS_REFERENCE_INTEGRATIONS_ENABLED=false` — در تمام محیط‌ها opt-in؛
- `BUSINESS_REFERENCE_PROVIDER_URL` — در Production فقط HTTPS و بدون credential/query/hash؛
- `BUSINESS_REFERENCE_PROVIDER_TOKEN` — secret مستقل با حداقل ۳۲ کاراکتر؛
- `BUSINESS_REFERENCE_PROVIDER_CONTRACT_VERSION` — نسخه قرارداد مصوب؛
- `BUSINESS_REFERENCE_PROVIDER_TIMEOUT_MS` — بین ۲۵۰ تا ۱۰٬۰۰۰، پیش‌فرض ۲۰۰۰؛
- `BUSINESS_REFERENCE_PROVIDER_SUBJECT_TYPES` — whitelist صریح موضوع‌های فعال.

در rollout ابتدا migration و `npm run verify:r6-data` اجرا می‌شود. سپس برای هر Provider
قرارداد و sandbox تکمیل، فقط subject همان Provider به whitelist افزوده و Flag ابتدا در staging
روشن می‌شود. rollback اپلیکیشن با خاموش کردن Flag انجام می‌شود؛ Schema additive باقی می‌ماند.

## شواهد و گیت‌های R6

- unit/contract test برای URL ثابت، header قرارداد، پاسخ معتبر، context mismatch، overload،
  network failure، snapshot منقضی و reference خارج Scope؛
- `npm run verify:r6-data` برای نبود snapshot canonical ناقص و جلوگیری از external
  reference تأییدنشده؛
- `npm run test:r6-runtime` برای اثبات 503 در create، 404 در lookup و صفر بودن Ticket/receipt
  نیمه‌کاره وقتی Flag خاموش است؛
- Prisma validate/migration status، lint، typecheck، suite کامل، coverage، release contract و
  production build.

## No-Goهای فعال باقی‌مانده

کد R6 قابل deploy با Flag خاموش است، اما روشن کردن هر Provider تا بسته شدن همه موارد زیر
ممنوع است:

- Owner و On-call نامشخص؛
- Endpoint Production و Sandbox نامشخص؛
- نبود قرارداد نسخه‌دار واقعی و Contract Test اجراشده در CI؛
- نبود روش نهایی M2M auth/rotation و سیاست rate limit؛
- نبود SLA/timeout/outage behavior و dashboard/alert؛
- نبود تأیید Security/Legal برای Scope و classification/retention داده؛
- هر خطای reconciliation، هر اختلاف cross-tenant یا هر پاسخ بدون context binding؛
- نبود rollback rehearsal و evidence موفق staging برای همان subject.

این No-Goها نقص پنهان کد نیستند؛ وابستگی‌های بیرونی ثبت‌شده‌اند و Flag پیش‌فرض اجازه
فعال‌شدن تصادفی آن‌ها را نمی‌دهد.
