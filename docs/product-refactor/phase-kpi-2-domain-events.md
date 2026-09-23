# فاز KPI-2 — تکمیل Eventهای دامنه

وضعیت: Completed

تاریخ اجرا: 2026-09-14

نسخه قرارداد: `KPI-V1` / Event Schema `v1`

Migration: `20260914142000_ticket_domain_event_contract`

## هدف

تبدیل Eventهای Ticketing و SLA از رشته‌های آزاد و payload عمومی به یک قرارداد typed،
قابل Replay، idempotent و فاقد داده حساس؛ به‌گونه‌ای که Reporting در فاز بعد بتواند تنها
از Event و Snapshot زمان وقوع استفاده کند.

## تغییرات اجراشده

### قرارداد و Producer

- Catalog مرکزی TypeScript برای Ticket، SLA و Routing ایجاد شد.
- `appendTicketEvent` فقط Event canonical می‌پذیرد و نام ناشناخته را پیش از هر نوشتن رد می‌کند.
- `eventId` یکسان در `TicketEvent` و `OutboxEvent` داخل همان Transaction ثبت می‌شود.
- `schemaVersion`، `aggregateVersion`، `actorType`، `sourceType`، `correlationId` و
  `causationId` به قرارداد پایدار Event اضافه شدند.
- تمام producerهای Customer، Workspace، SLA Worker، Lifecycle Worker، Legacy Adapter و
  Reconciliation دارای actor/source صریح شدند.
- برای هر Business Reference تأییدشده، رویداد `ticket.business_reference_linked.v1`
  بدون حمل external ID تولید می‌شود.
- Legacy Adapter دیگر `ticket.staff_replied.v1`، `ticket.closed_legacy.v1` یا
  `ticket.reopened_legacy.v1` تولید نمی‌کند.

### Snapshot و حریم داده

Envelope جدید Scope طرف حساب/سازمان و Snapshot زمان Event برای Service، Request Type، Team،
Queue، Owner، Priority، Route و SLA Policy دارد. تنها ID داخلی، code و label کسب‌وکاری مجاز
هستند؛ متن پیام، خلاصه حل، Root Cause آزاد، فایل، موبایل، کدملی، token و شناسه خارجی وارد
Outbox نمی‌شوند.

Metadata داخلی `TicketEvent` برای Timeline عملیاتی حفظ می‌شود، اما Outbox فقط کلیدهای
allowlist شده و scalar را در `payload.attributes` حمل می‌کند. برای نمونه، Rating و threshold
SLA مجازند ولی `resolutionSummary` حذف می‌شود و فقط `rootCauseRecorded` بولی Snapshot می‌شود.

### Migration و داده تاریخی

- همه Eventهای تاریخی `eventId` پایدار، actor/source و schema version دریافت کردند.
- نام Business Eventهای تاریخی تغییر نکرد تا اصل append-only نقض نشود.
- Outboxهای قدیمی بازسازی و metadata آزاد آن‌ها حذف شد.
- چون Snapshot واقعی زمان وقوع برای رکورد قدیمی قابل اثبات نبود، `aggregateVersion=null` و
  `snapshotStatus=HISTORICAL_INCOMPLETE` ثبت شد؛ این رکوردها در Reporting حدس زده نمی‌شوند.
- Unique index شناسه Event و index ترتیب Aggregate اضافه شد.

### Consumer، Replay و Idempotency

- SLA Consumer اکنون نام canonical `ticket.public_message_added.v1` را مصرف می‌کند.
- پیام عمومی فقط با `actorType=STAFF` و `sourceType=HUMAN` پاسخ اول محسوب می‌شود؛ پیام مشتری
  پاسخ اول را به‌اشتباه ثبت نمی‌کند.
- سه Alias تاریخی فقط در لایه Replay به canonical نگاشت می‌شوند.
- Ledger تحویل با Unique Key `(outboxEventId, consumer)` و `skipDuplicates` از اثر دوباره
  جلوگیری می‌کند و ترتیب هر Ticket قبل از claim کنترل می‌شود.
- Event ناشناخته به‌صورت کنترل‌شده ignore و Delivery آن خاتمه داده می‌شود تا crash-loop نسازد.

## شواهد اجرا

| کنترل | نتیجه |
| --- | --- |
| Prisma schema validation | PASS |
| Migration روی MySQL لوکال | PASS؛ ۲۸ Migration همگام |
| Drift دیتابیس نسبت به Prisma Schema | PASS؛ `No difference detected` |
| Smoke یکپارچگی Event/Outbox | PASS؛ ۴۸ Event تاریخی |
| TicketEvent بدون Outbox | ۰ |
| mismatch شناسه Event/Outbox | ۰ |
| Envelope ناقص پس از Migration | ۰ |
| payload دارای کلید حساس ممنوع | ۰ |
| Delivery تکراری برای یک Consumer | ۰ |
| تست اختصاصی Canonical/Alias/Sanitization/SLA | PASS؛ ۲۰ Test |
| مجموعه کامل Jest | PASS؛ ۷۷ Suite و ۴۱۴ Test |
| TypeScript | PASS |
| ESLint | PASS |
| Production Build | PASS؛ Next.js 16.3.4 / ۵۴ صفحه static تولیدشده |
| Next.js compilation issues | PASS؛ صفر Issue در `/_next/mcp` |
| Runtime صفحه Landing | PASS؛ DOM و React بدون page error، Console فقط HMR |
| Health پس از Restart | PASS؛ live و ready هر دو HTTP 200 |

## Rollback و ریسک

Migration ستون و index افزایشی دارد و Ticket/Message عملیاتی را حذف یا بازنویسی نمی‌کند.
بازسازی payload قدیمی فقط روی Outbox کوتاه‌عمر انجام شد و داده اصلی `TicketEvent.metadata`
بدون تغییر باقی ماند. Rollback اپلیکیشن باید با نسخه‌ای انجام شود که ستون‌های اضافه را نادیده
می‌گیرد؛ حذف ستون‌ها یا بازگرداندن payload آزاد مجاز نیست و در صورت نیاز Migration جدا می‌خواهد.

## موارد خارج از این فاز

- Consumer و Projection مدل‌های Reporting؛
- Backfill محاسباتی `TicketReportingFact`؛
- API، Permission و UI داشبورد KPI؛
- اتصال Provider حجم تراکنش و Journey مرکز دانش.

## قرارداد ورود به KPI-3

فاز KPI-3 باید Consumer مستقل Reporting را با `ReportingProcessedEvent`، checkpoint، کنترل
gap/replay و Projection اولیه `TicketReportingFact` پیاده کند؛ Eventهای
`HISTORICAL_INCOMPLETE` باید صریحاً در Data Quality قرار بگیرند و هرگز با وضعیت فعلی Ticket
به‌صورت حدسی تکمیل نشوند.
