# فاز KPI-1 — طراحی دیتابیس Reporting

وضعیت: Completed

تاریخ اجرا: 2026-09-14

نسخه قرارداد: `KPI-V1`

Migrationها:

- `20260914140000_reporting_foundation`
- `20260914141000_reporting_definition_version_integrity`

## هدف

ایجاد زیرساخت دیتابیس additive و قابل بازسازی برای ۹ KPI، بدون تغییر مخرب در جداول
عملیاتی Ticketing و بدون اعلام زودهنگام آمادگی Dashboard.

## مدل‌های اضافه‌شده

| مدل | مسئولیت |
| --- | --- |
| `KpiDefinitionVersion` | نگه‌داری نسخه و Hash قرارداد مصوب KPI |
| `TicketReportingFact` | Fact قابل بازسازی هر تیکت برای زمان، SLA، FCR، Reopen و CSAT |
| `ReportingProcessedEvent` | تضمین idempotency پردازش Event |
| `ReportingProjectionCheckpoint` | Cursor، Lease، Rebuild و وضعیت سلامت Projection |
| `SupportJourney` | داده حداقلی و pseudonymous برای حل خودکار |
| `TransactionVolumeDaily` | مخرج روزانه و نسخه‌دار تراکنش موفق |
| `ReportingRootCauseDimension` | Root Cause استاندارد و بدون Group کردن متن آزاد |
| `RecurringProblemSignal` | سیگنال نسخه‌دار مشکل پرتکرار و Baseline آن |

## تصمیم‌های طراحی

- `TicketReportingFact` به Ticket وابسته و با حذف Retention آن Cascade می‌شود، چون Fact از
  Eventها قابل بازسازی است.
- حذف Ticket تبدیل‌شده، Journey را حذف نمی‌کند و فقط Reference آن را `SET NULL` می‌کند؛
  Journey pseudonymous برای مخرج حل خودکار باقی می‌ماند.
- حذف Root Cause استاندارد، Signal تاریخی را حذف نمی‌کند و Reference را `SET NULL` می‌کند.
- Dimensionهای Service، Request Type، Team و Queue در Fact و Signal Snapshot می‌شوند تا
  تغییر نام یا Taxonomy گزارش گذشته را بازنویسی نکند.
- Owner فقط با شناسه داخلی ذخیره می‌شود؛ نام، موبایل، کدملی، متن تیکت/پیام، فایل و شناسه
  پرداخت در مدل‌های Reporting وجود ندارد.
- `partyKeyHash` در Journey جایگزین شناسه هویتی مستقیم است.
- حجم تراکنش با Scope غیر nullable و Unique Key مرکب ذخیره می‌شود تا `NULL` باعث رکورد
  روزانه تکراری نشود.
- Duration و Countها دارای CHECK غیرمنفی، Rating دارای CHECK بازه ۱ تا ۵ و تمام Windowها
  دارای CHECK ترتیب زمانی هستند.
- `eventId`، `ticketId` و `signalKey` مرزهای idempotency مستقل دارند.
- تمام Fact، Event پردازش‌شده، Checkpoint، Journey و Signalها با Foreign Key محدودکننده
  به نسخه ثبت‌شده KPI متصل‌اند و نسخه قرارداد دارای داده قابل حذف نیست.
- نام ایندکس‌های طولانی با `map` کوتاه شده‌اند تا محدودیت ۶۴کاراکتری MySQL نقض نشود.

## نسخه فعال قرارداد

Migration یک رکورد Active برای `KPI-V1` ثبت می‌کند. `contractHash` برابر SHA-256 فایل
`docs/product-refactor/kpi-definitions.md` است. اسکریپت Reset محلی نیز پس از پاک‌سازی داده‌های
غیرکاربری همین نسخه و Hash را دوباره می‌سازد و وجود دقیقاً یک نسخه فعال را کنترل می‌کند.

## ایندکس‌های Query-driven

- Cohort ایجاد، اولین پاسخ، اولین حل و آخرین Close؛
- وضعیت FCR و زمان Mature شدن؛
- وضعیت SLA پاسخ اول و حل؛
- Service/Request Type و Team/Queue در بازه زمانی؛
- Owner و Organization در بازه زمانی؛
- Rating و زمان ثبت؛
- Journeyهای منقضی‌شونده و تبدیل‌شده؛
- حجم تراکنش بر اساس نوع، روز، Scope و وضعیت تأیید؛
- Signal بر اساس Window، Taxonomy، Root Cause و Incident Key.

## Migration و Rollback

- Migration فقط `CREATE TABLE`، `ALTER TABLE` روی جدول‌های تازه‌ساخته‌شده برای Foreign Key
  و `INSERT` نسخه قرارداد دارد.
- هیچ `DROP`، Rename یا Alter روی جدول عملیاتی موجود اجرا نمی‌شود.
- Rollback اپلیکیشن با غیرفعال‌کردن Consumer/API آینده انجام می‌شود و جدول‌های additive
  باقی می‌مانند؛ حذف فیزیکی آن‌ها فقط با Migration مستقل و پس از اثبات عدم مصرف مجاز است.
- Migration روی دیتابیس لوکال `ticketing_system@localhost:3306` اعمال شده است؛ Production
  همچنان باید از مسیر `prisma migrate deploy` و گیت انتشار خودش عبور کند.

## شواهد اجرا

| کنترل | نتیجه |
| --- | --- |
| `npx prisma validate` | PASS |
| `npx prisma migrate deploy` | PASS؛ ۲۷ Migration همگام |
| Drift دیتابیس به Prisma Schema | PASS؛ `No difference detected` |
| تولید Prisma Client 5.22.0 | PASS |
| تست قرارداد Schema/Migration | PASS؛ ۵ تست |
| Smoke test روی MySQL واقعی | PASS؛ ۵ نوشتن نامعتبر Reject و صفر رکورد باقی‌مانده |
| TypeScript | PASS |
| ESLint | PASS |
| مجموعه کامل Jest | PASS؛ ۷۵ Suite و ۴۰۰ Test |
| Production Build | PASS؛ Next.js 16.3.4 Turbopack |
| سلامت dev server پس از Restart | PASS؛ HTTP 200 |

## موارد عمداً خارج از این فاز

- تولید Eventهای تکمیلی و یکسان‌سازی نام Event؛
- Worker/Projection و Backfill Fact؛
- ایجاد Permissionهای Reporting؛
- API و UI گزارش؛
- اتصال واقعی Journey دانش یا Provider تراکنش؛
- تولید Signal مشکل پرتکرار.

وجود جدول خالی نباید در UI به‌عنوان KPI صفر نمایش داده شود.

## قرارداد ورود به KPI-2

فاز KPI-2 باید Eventهای دامنه را canonical و typed کند، `actorType/sourceType` و Snapshotهای
غیرحساس لازم را در Outbox قرار دهد، ناسازگاری نام Event پاسخ کارشناس را رفع کند و با Replay
و idempotency test ثابت کند که هر عملیات commit‌شده دقیقاً یک اثر قابل پردازش دارد.
