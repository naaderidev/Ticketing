# فاز KPI-3 — موتور Projection گزارش‌ها

وضعیت: Completed

تاریخ اجرا: 2026-09-15

نسخه قرارداد: `KPI-V1` / Event Schema `v1`

Migration: `20260915100000_reporting_projection_sla_snapshots`

## هدف

تبدیل Outbox نسخه‌دار به Fact قابل بازسازی تیکت، بدون Query کردن وضعیت جاری Ticket برای
تکمیل ابعاد تاریخی و بدون دو بار شمردن Event در retry یا replay.

## اجزای اجراشده

- Consumer مستقل `REPORTING_TICKET_FACT_KPI_V1` که Outbox را بر اساس Cursor صعودی می‌خواند.
- parser مرزی برای تطبیق `eventId`، نوع، Aggregate، نسخه Schema و زمان Envelope با رکورد
  Outbox؛ payload ناسازگار checkpoint را جلو نمی‌برد.
- Projection اولیه `TicketReportingFact` برای زمان پاسخ اول، زمان حل، Pause مؤثر، SLA،
  FCR، Reopen، CSAT، تعداد پیام عمومی، Transfer، Collaboration و Snapshot ابعاد.
- Snapshot سررسیدهای پاسخ اول/حل و وضعیت terminal SLA؛ Cohort رعایت تعهد از داده تاریخی
  محاسبه می‌شود و به وضعیت mutable فعلی `TicketSla` وابسته نیست.
- دفتر `ReportingProcessedEvent` با کلید `eventId` و `outboxEventId` برای idempotency.
- checkpoint دارای Cursor، Lease انحصاری، تمدید Lease، وضعیت سلامت، Failure count و کد خطا.
- تشخیص gap نسخه Aggregate؛ چند Event هم‌نسخه مجاز است، نسخه آینده بیش از یک گام پردازش
  را متوقف می‌کند و نسخه قدیمی بدون اثر دوباره ثبت می‌شود.
- Rebuild کنترل‌شده که فقط Fact و ledger قابل‌بازسازی Reporting را پاک می‌کند و تمام
  Outbox را از ابتدا replay می‌کند؛ جدول‌های عملیاتی Ticketing تغییر نمی‌کنند و تعویض نسخه
  قرارداد همراه Reset checkpoint اتمیک است.
- Maturation پنجره هفت‌روزه FCR با نتیجه `ACHIEVED`، `NOT_ACHIEVED` یا `EXCLUDED`.
- Route داخلی `POST /api/internal/reporting/process` با Bearer مستقل، rate limit، audit،
  Feature Flag و پاسخ `409` هنگام در اختیار بودن Lease توسط Worker دیگر.

## اتمی بودن و بازیابی

برای هر Event، تغییر Fact، درج ledger و جلو رفتن checkpoint در یک تراکنش Serializable انجام
می‌شود. اگر یکی از این مراحل شکست بخورد هیچ‌کدام commit نمی‌شوند. retry همان `eventId` را از
ledger تشخیص می‌دهد و فقط Cursor را بازیابی می‌کند؛ بنابراین Count و Duration دوباره افزایش
پیدا نمی‌کنند.

Lease منقضی‌شده قابل تصاحب است، ولی Worker پیشین پس از از دست دادن Token دیگر اجازه تغییر
checkpoint ندارد. خطای Envelope، Schema، Rating، SLA target یا Aggregate gap وضعیت را
`FAILED` و `lastErrorCode` را قابل پایش می‌کند و Event معیوب از دست نمی‌رود.

## قرارداد Data Quality

- `snapshotStatus=HISTORICAL_INCOMPLETE` یا `aggregateVersion=null` فقط Fact با
  `dataQualityStatus=EXCLUDED` و دلیل `HISTORICAL_INCOMPLETE` می‌سازد.
- Event کامل بعدی حق ندارد Fact تاریخی کنارگذاشته‌شده را با Snapshot وضعیت فعلی کامل کند.
- Snapshot کامل ولی فاقد Dimension اجباری `INCOMPLETE` می‌شود، نه `HEALTHY`.
- Ticket حذف‌شده طبق Retention، Event را با دلیل `SOURCE_TICKET_RETAINED_DELETED` ثبت و
  نادیده می‌گیرد؛ هیچ Ticket یا Fact مصنوعی ایجاد نمی‌شود.
- Event ناشناخته با `EVENT_TYPE_UNSUPPORTED` نادیده گرفته می‌شود تا Forward compatibility
  حفظ شود؛ Schema ناشناخته fail-closed است و نیاز به ارتقای Consumer دارد.

## تنظیمات استقرار

| متغیر | پیش‌فرض | قاعده |
| --- | --- | --- |
| `FEATURE_REPORTING_PROJECTION_ENABLED` | local/test روشن، production خاموش | rollout مستقل و fail-closed در Production |
| `REPORTING_MAINTENANCE_TOKEN` | ندارد | در Production مستقل و حداقل ۳۲ کاراکتر |
| `REPORTING_PROJECTION_BATCH_SIZE` | `100` | بین ۱ تا ۵۰۰ |
| `REPORTING_PROJECTION_LEASE_SECONDS` | `120` | بین ۳۰ تا ۹۰۰ ثانیه |
| `REPORTING_REBUILD_MAX_EVENTS` | `100000` | سقف ایمنی Rebuild |

Fallback توکن SLA یا Attachment فقط در محیط غیر Production برای rehearsal محلی پذیرفته
می‌شود. Production بدون توکن اختصاصی بالا نمی‌آید.

## شواهد اجرا

| کنترل | نتیجه |
| --- | --- |
| تست parser، reducer، config و endpoint | PASS |
| پردازش واقعی Outbox در MySQL | PASS؛ ۵۹ Event، ۱۳ Applied و ۴۶ Ignored |
| Data Quality تاریخی | PASS؛ ۱۳ Fact همگی `EXCLUDED/HISTORICAL_INCOMPLETE` و صفر Healthy جعلی |
| idempotent replay واقعی | PASS؛ replay یک Event، تعداد ledger و Fact بدون تغییر |
| Rebuild کامل روی MySQL محلی | PASS؛ تمام ۵۹ Event یک‌بار بازسازی و اجرای دوم idle |
| checkpoint نهایی | `HEALTHY`، Cursor `511`، Lease خالی، Failure صفر |
| Prisma Migration | PASS؛ ۲۹ Migration همگام |
| TypeScript و ESLint | PASS |
| مجموعه کامل Jest | PASS؛ ۸۱ Suite و ۴۳۴ Test، یک integration opt-in در اجرای عادی skip |
| Production Build | PASS؛ Next.js 16.3.4 / Turbopack |
| Next runtime | PASS؛ Route ثبت‌شده و compilation/config/session error صفر |

اعداد بالا snapshot زمان اجرای فاز هستند و با ایجاد Event جدید طبیعتاً تغییر می‌کنند.

## خارج از این فاز

- Query/API تجمیعی KPI و کنترل Scope نقش‌ها؛
- داشبورد، نمودار، Drill-down و Export؛
- Journey حل خودکار، حجم تراکنش و Signal مشکل پرتکرار؛
- alerting بیرونی و زمان‌بندی زیرساخت Production.

وجود Fact به معنی مجاز بودن نمایش KPI نیست؛ APIهای بعدی باید Data Quality، freshness،
permission و suppression قرارداد KPI-V1 را اعمال کنند.
