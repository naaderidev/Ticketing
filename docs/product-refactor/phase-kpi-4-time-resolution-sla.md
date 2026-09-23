# فاز KPI-4 — زمان پاسخ، زمان حل و SLA

وضعیت: Completed

تاریخ اجرا: 2026-09-15

نسخه قرارداد: `KPI-V1`

Migration: `20260915110000_reporting_time_sla_permissions`

## هدف

انتشار سه شاخص زمان پاسخ اول، زمان حل کامل و رعایت SLA از روی read model فاز ۳؛ بدون
Query مستقیم Ticket عملیاتی، بدون محاسبه در Browser و بدون تبدیل داده ناقص یا مخرج صفر
به مقدار جعلی صفر.

## قرارداد API اجراشده

`GET /api/v2/reporting/kpis/time-sla?from={ISO-8601}&to={ISO-8601}`

- `from` شامل و `to` غیرشامل است و هر دو باید offset صریح داشته باشند.
- تبدیل بازه تقویم شمسی/هفته شنبه‌ای مسئول UI بعدی است؛ API Timestamp UTC بازمی‌گرداند.
- حداکثر بازه هر Query برابر ۳۶۶ روز است تا Query بدون کران وارد read model نشود.
- پاسخ `definitionVersion=KPI-V1`، `asOf`، منطقه `Asia/Tehran`، Scope، Freshness، Data
  Quality و شمار نمونه را برمی‌گرداند.
- Cache پاسخ `private, no-store` و Rate Limit برابر ۳۰ Query در دقیقه برای هر Session است.

## محاسبات

### زمان پاسخ اول

Cohort از `ticketCreatedAt` در بازه ساخته می‌شود. فقط Factهای `HEALTHY` و Native وارد
Duration می‌شوند. مقدار read model همان فاصله `slaStartedAt` تا اولین پیام عمومی انسانی
کارشناس، منهای Pause معتبر `WAITING_USER` است. خروجی میانگین، میانه، P90 nearest-rank،
`respondedCount`، `pendingCount` و `excludedCount` دارد.

### زمان حل

Cohort از اولین `firstResolvedAt` در بازه ساخته می‌شود. Reopen اولین زمان حل را عوض
نمی‌کند. Duration از `resolutionEffectiveMilliseconds` خوانده و میانگین، میانه، P90،
`resolvedCount` و `excludedCount` منتشر می‌شود.

### SLA

- پاسخ اول بر مبنای `firstResponseDueAt` در بازه؛
- حل بر مبنای `resolutionDueAt` در بازه؛
- ترکیبی بر مبنای Cohort اولین حل و نهایی‌شدن هر دو Target؛
- درصد برابر `MET / (MET + BREACHED) * 100` با Round Half Up تا دو رقم اعشار؛
- `PENDING/PAUSED`، `NOT_APPLICABLE` و excluded خارج مخرج و جداگانه شمارش می‌شوند.

## Access Control

| Permission | Scope اجرایی | Grant پیش‌فرض |
| --- | --- | --- |
| `reporting.kpi.read.global` | Assignment سراسری `*` | `SUPPORT_MANAGER` |
| `reporting.kpi.read.team` | فقط Team IDهای صریح و سازگار Assignment | `SUPERVISOR` |
| `reporting.kpi.audit.read` | Aggregate سراسری بدون Drill-down | `AUDITOR` |
| `reporting.kpi.export` | در این فاز Endpoint ندارد | بدون Grant پیش‌فرض |

`SYSTEM_ADMINISTRATOR` عمداً هیچ Permission گزارش پیش‌فرض دریافت نکرده است. Seed محلی
صرفاً اولین حساب Admin را با یک Assignment صریح و جداگانه `SUPPORT_MANAGER` برای سناریوی
ارائه آماده می‌کند؛ این رفتار در Migration تولیدی روی کاربران موجود اعمال نمی‌شود.

## Freshness و Data Quality

- lag از سن قدیمی‌ترین Event پردازش‌نشده Ticket نسبت به `asOf` محاسبه می‌شود؛ نبود backlog
  برابر lag صفر است.
- بیشتر از ۵ دقیقه `STALE` و بیشتر از ۱۵ دقیقه `UNAVAILABLE` است.
- checkpoint مفقود، نسخه ناسازگار، `FAILED`، `REBUILDING` یا `UNAVAILABLE` انتشار مقدار KPI
  را متوقف می‌کند و `reason=PROJECTION_UNAVAILABLE` می‌دهد.
- نبود نمونه `NO_ELIGIBLE_DATA` و مخرج صفر SLA برابر `ZERO_DENOMINATOR` است.
- Fact ظاهراً Healthy ولی فاقد Duration/State لازم، `CRITICAL_DATA_QUALITY` ایجاد می‌کند.
- شمارنده‌های `eligibleCount`، `excludedCount`، `missingEventCount`،
  `missingDimensionCount`، `legacyCount`، `projectionLagSeconds` و
  `lastProjectedEventAt` همراه پاسخ هستند.
- اصلاح Projection انجام شد تا نبود `slaStartedAt` هرگز با `ticketCreatedAt` جایگزین نشود.

## Rollout و Rollback

- API در local/test روشن و در Production به‌صورت پیش‌فرض خاموش است.
- پس از Migration، Rebuild/پردازش Projection و reconciliation، متغیر
  `FEATURE_REPORTING_API_ENABLED=true` فعال می‌شود.
- Rollback کاربردی با خاموش‌کردن Feature Flag انجام می‌شود. Migration فقط Permissionهای
  additive افزوده و داده عملیاتی Ticket را تغییر نمی‌دهد.

## شواهد پذیرش

- مثال پاسخ ۴۰ دقیقه با ۱۰ دقیقه Pause به ۳۰ دقیقه تبدیل می‌شود.
- مثال حل سه‌ساعته با ۶۰ دقیقه Pause به ۱۲۰ دقیقه تبدیل می‌شود.
- ۸۰ Target مت و ۲۰ Target breached دقیقاً ۸۰٪ منتشر می‌کند.
- بازه معکوس، Timestamp بدون offset، پارامتر تکراری و بازه بیش از ۳۶۶ روز رد می‌شود.
- کاربر بدون Grant، مدیر سیستم صرف و Assignment تیم ناسازگار داده‌ای دریافت نمی‌کنند.
- empty cohort و projection unavailable مقدار `null` با دلیل ثابت برمی‌گردانند.

## نتیجه اجرای محلی

| کنترل | نتیجه |
| --- | --- |
| Migration | PASS؛ ۳۰ Migration همگام و drift صفر |
| Projection پیش‌نیاز | PASS؛ checkpoint برابر `HEALTHY`، failure صفر |
| Permission | PASS؛ Grant صریح `SUPPORT_MANAGER` برای حساب ارائه بهاره نادری |
| تست‌های هدف فاز | PASS؛ ۵۷ تست Reporting/Feature Flag |
| تست یکپارچه MySQL | PASS؛ Projection rebuild و Query scoped واقعی |
| رگرسیون کامل Jest | PASS؛ ۸۶ Suite و ۴۵۶ Test، دو integration opt-in در اجرای عادی skip |
| TypeScript و ESLint | PASS |
| Release contract | PASS |
| Production build | PASS؛ Next.js 16.3.4 / Turbopack و Route ثبت‌شده |
| Runtime مرورگر و Next MCP | PASS؛ پاسخ ۲۰۰، compile issue صفر، config/session error صفر |

دیتابیس فعلی ۱۳ Fact تاریخی `HISTORICAL_INCOMPLETE` دارد. این رکوردها طبق قرارداد وارد
KPI نشده و در بازه فعلی مقدار `null` با دلیل `NO_ELIGIBLE_DATA` می‌دهند. این رفتار نقص
محاسبه نیست و از ساخت عدد نمایشی نادرست جلوگیری می‌کند؛ داده Native جدید پس از عبور از
Projection به‌صورت عادی وارد Cohort می‌شود.
