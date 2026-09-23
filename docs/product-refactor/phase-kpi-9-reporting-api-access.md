# فاز KPI-9 — API گزارش و کنترل دسترسی

وضعیت: Completed

نسخه قرارداد: `KPI-V1`

## نتیجه

تمام ۹ شاخص قرارداد اکنون API محاسباتی سمت سرور دارند. KPI حل خودکار از Journeyهای عمومی، تأییدشده و فعال محاسبه می‌شود و Journey تبدیل‌شده به تیکت، دارای مداخله انسانی یا فاقد نتیجه نهایی را به‌عنوان حل خودکار موفق نمی‌شمارد.

## APIها

- `GET /api/v2/reporting/access`: Scope مؤثر و قابلیت‌های `canExport` و `canDrillDown`.
- `GET /api/v2/reporting/kpis/time-sla`: KPIهای زمان پاسخ، زمان حل و SLA.
- `GET /api/v2/reporting/kpis/quality`: FCR، بازگشایی و CSAT.
- `GET /api/v2/reporting/kpis/automated-resolution`: حل خودکار.
- `GET /api/v2/reporting/kpis/ticket-per-transaction`: تیکت به ازای تراکنش.
- `GET /api/v2/reporting/kpis/recurring-problems`: رتبه و سیگنال مشکلات پرتکرار.
- `GET /api/v2/reporting/kpis/recurring-problems/{signalKey}/tickets`: Drill-down کنترل‌شده.
- `GET /api/v2/reporting/exports/{reportType}`: خروجی CSV تجمیعی.

همه پاسخ‌های JSON خصوصی و `no-store` هستند و خطاها قرارداد پایدار `requestId/code/message` دارند. بازه‌ها در سرور اعتبارسنجی و محاسبات فقط از read model گزارش‌گیری انجام می‌شوند.

## کنترل دسترسی

- `reporting.kpi.read.team`: فقط تیم‌های صریح و فعال UserRoleAssignment.
- `reporting.kpi.read.global`: داده همه تیم‌ها.
- `reporting.kpi.audit.read`: فقط Aggregate سراسری، بدون Drill-down و بدون گزارش سازمانی تفکیک‌شده.
- `reporting.kpi.export`: علاوه بر مجوز read و دقیقاً در همان Scope لازم است.
- نقش فنی `SYSTEM_ADMINISTRATOR` به‌تنهایی هیچ مجوز گزارش ایجاد نمی‌کند.
- Drill-down علاوه بر مجوز گزارش، مجوز مستقل `support.workspace.access` و `ticket.workspace.read` را دوباره بررسی و Scopeها را با هم تقاطع می‌دهد.
- گزارش تفکیک‌شده یک سازمان تا رسیدن به حداقل ۵ تیکت با پاسخ `NOT_FOUND` Suppress می‌شود؛ ممیز حتی پس از عبور از این آستانه نیز گزارش سازمانی تفکیک‌شده دریافت نمی‌کند.

## امنیت Export

- خروجی فقط از Aggregateهای ازقبل مجاز ساخته می‌شود و متن پیام، موبایل، کد ملی، نام فایل و شناسه مالی وارد آن نمی‌شود.
- سقف مستقل ۱۰ خروجی در ۵ دقیقه برای هر کاربر اعمال می‌شود.
- سلول‌های آغازشونده با `=`, `+`, `-` یا `@` در CSV خنثی می‌شوند تا Formula Injection رخ ندهد.
- ثبت Audit برای خروجی موفق fail-closed است؛ اگر Audit ذخیره نشود فایل تحویل داده نمی‌شود.
- تلاش فاقد مجوز نیز با outcome برابر `DENIED` ثبت می‌شود.

## Scope حل خودکار

`SupportJourney.supportTeamId` به‌عنوان Snapshot زمان نمایش محتوا افزوده شد. Journeyهای جدید تیم Route فعال نوع درخواست را ثبت می‌کنند. داده قدیمی عمداً با Route امروز Backfill نمی‌شود، چون این کار تاریخچه را بازنویسی می‌کند؛ مقدار آن‌ها `NULL` و در Data Quality قابل مشاهده باقی می‌ماند.

## داده دمو

Seed لوکال نقش مستقل `REPORTING_EXPORTER` را فقط با مجوز Export می‌سازد و آن را به‌صورت Assignment صریح به مدیر گزارش دمو می‌دهد. در Production هیچ Grant خودکاری از نقش مدیر سیستم استنتاج نمی‌شود.

## تأیید تکرارپذیر

1. `npx prisma migrate deploy`
2. `npm run test:kpi-r9-reporting-api-access`
3. `npm run verify:release-contract`
4. `npm run lint && npm run typecheck && npm run test:ci && npm run build`
