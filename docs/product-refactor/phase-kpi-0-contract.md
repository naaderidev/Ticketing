# فاز KPI-0 — تثبیت قرارداد شاخص‌های موفقیت

وضعیت: Completed

تاریخ اجرا: 2026-09-14

نسخه خروجی: `KPI-V1`

مرجع اجرا: دستور صریح مالک پروژه برای اجرای فاز صفر از برنامه ۱۲فازی Reporting

## هدف

تبدیل بخش «شاخص‌های سنجش موفقیت» از توضیح محصول به قرارداد محاسباتی قابل پیاده‌سازی، پیش
از هر Migration، Projection، API یا UI.

## خروجی‌های تثبیت‌شده

- ۹ KPI اصلی با Cohort، صورت، مخرج، فرمول، استثنا و نمونه پذیرش؛
- UTC برای ذخیره و محاسبات داخلی، و قرارداد شمسی `Asia/Tehran` برای ورودی/خروجی API و UI؛
- Pause فقط برای `WAITING_USER`؛
- First Response صرفاً پاسخ عمومی انسانی؛
- FCR بدون پاسخ مجدد مشتری، Transfer/Collaboration و Reopen در پنجره هفت‌روزه؛
- SLA Compliance جدا برای پاسخ اول، حل و حالت ترکیبی؛
- Reopen Rate بر اساس تیکت یکتا و Cohort هفت‌روزه Matured؛
- CSAT همراه نرخ مشارکت، حداقل ۳۰ پاسخ و حداقل مشارکت ۲۰٪؛
- Automated Resolution فقط با تأیید کاربر و بدون ورود کارشناس یا Ticket مرتبط؛
- Ticket per Transaction به ازای ۱۰۰۰ تراکنش موفق و فقط با مخرج Provider معتبر؛
- سیگنال مشکل پرتکرار با حداقل ۵ تیکت، ۳ Party و رشد دوبرابری نسبت به Baseline؛
- Permissionهای هدف، Scope تیمی، Suppression و منع دسترسی پیش‌فرض مدیر سیستم؛
- قرارداد Data Quality، Projection freshness و ممنوعیت نمایش صفر جعلی.

## تصمیم‌های اجرایی

1. `kpi-definitions.md` تنها مرجع معنایی `KPI-V1` است.
2. `TicketEvent` و Snapshot نسخه‌دار منبع تاریخچه هستند؛ Query از وضعیت فعلی Ticket مرجع
   KPI تاریخی نیست.
3. Reporting از Ticketing مستقل و read-only باقی می‌ماند.
4. دو KPI حل خودکار و تیکت به ازای تراکنش تا فراهم‌شدن Journey و Provider معتبر مقدار
   `null` دارند و با Seed یا تخمین Production پر نمی‌شوند.
5. Incident کامل همچنان طبق `D-015` در V1.1 است؛ V1 فقط Schema/Reference و گروه Root Cause
   استاندارد لازم برای Reporting را پیش‌بینی می‌کند.

## موارد عمداً خارج از این فاز

- تغییر Prisma Schema یا Migration؛
- ایجاد Permission در دیتابیس؛
- Event producer یا Reporting consumer؛
- Backfill؛
- API و داشبورد؛
- اتصال Provider تراکنش و Journey مرکز دانش.

این موارد از فاز KPI-1 به بعد اجرا می‌شوند.

## بررسی Definition of Done

| کنترل | نتیجه |
| --- | --- |
| ۹ KPI دارای فرمول قطعی هستند | PASS |
| بازه، Timezone و Pause تعیین شده‌اند | PASS |
| FCR، Reopen و CSAT تصمیم باز ندارند | PASS |
| Scope نقش‌ها و Export مشخص است | PASS |
| رفتار داده ناقص و نمونه ناکافی مشخص است | PASS |
| وابستگی‌های بیرونی صریح هستند | PASS |
| کد و دیتابیس عملیاتی در این فاز تغییر نکرده‌اند | PASS |

## قرارداد ورود به KPI-1

فاز KPI-1 باید Schema را فقط به‌صورت additive طراحی کند و برای هر فیلد Fact یا Aggregate
به بند مشخصی از `KPI-V1` ارجاع دهد. هر ابهام جدید پیش از Migration با Decision نسخه‌دار
بسته می‌شود.
