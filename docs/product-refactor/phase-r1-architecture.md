# فاز R1 — معماری دامنه و نقشه گذار

وضعیت: کامل — قرارداد معماری `R1-v1`

تاریخ: 2026-09-13

پیش‌نیاز: Baseline محصول `R0-v1`

## هدف

این فاز مشخص می‌کند قابلیت‌های مصوب R0 چگونه بدون بازنویسی یک‌مرحله‌ای، شکستن API فعلی یا
تکرار منبع حقیقت سرویس‌های برقتو به معماری فعلی اضافه شوند.

## تصمیم نهایی

- معماری V1 یک Modular Monolith در همین Next.js application است.
- `src/app` لایه Route/UI و `src/modules` محل منطق دامنه و Use Caseها خواهد بود.
- Route Handlerها Endpoint عمومی‌اند و باید Thin، احرازشده، اعتبارسنجی‌شده و بدون منطق
  کسب‌وکار باشند.
- API جدید با `/api/v2` نسخه‌گذاری می‌شود؛ API موجود تا پایان Cutover سازگار می‌ماند.
- MySQL منبع حقیقت Ticketing است، ولی اطلاعات مالی/قرارداد/دارایی از سرویس مالک خوانده می‌شود.
- Domain Event، Security Audit و Delivery Outbox سه جریان مستقل با مسئولیت متفاوت‌اند.
- CQRS، Event Sourcing، Message Broker، DI Container و Microservice در V1 اضافه نمی‌شوند.
- عملیات چندمرحله‌ای در Transaction و عملیات تکرارپذیر با Idempotency کنترل می‌شوند.
- Ticket mutationها با Version/ETag در برابر Lost Update محافظت می‌شوند.

## خروجی‌های R1

- `architecture-and-modules.md`: مرز ماژول‌ها، وابستگی‌ها و ساختار کد هدف
- `architecture-decisions.md`: تصمیم‌های معماری و گزینه‌های ردشده
- `api-v2-contract.md`: قرارداد HTTP، خطا، Pagination، Idempotency و Concurrency
- `event-catalog.md`: Event Envelope و رویدادهای اصلی
- `migration-and-rollout.md`: Expand/Backfill/Dual-run/Cutover و Feature Flagها
- `threat-model.md`: دارایی‌ها، مرزهای اعتماد، تهدیدها و گیت‌های امنیتی

## اثر بر نسخه فعلی

در این فاز هیچ Runtime Code، Prisma Schema یا Migration تغییر نکرد. Serviceها، Routeها و
صفحات فعلی ورودی Migration هستند. مسیر فعلی `/api/*` در فازهای بعدی با Compatibility
Adapter حفظ می‌شود تا UI قدیمی تا زمان Cutover کار کند.

## معیار خروج

- مرز مسئولیت و مالکیت داده هر ماژول مشخص است.
- وابستگی مجاز و ممنوع میان ماژول‌ها ثبت شده است.
- API v2 دارای Shape ثابت، مدل خطا، Pagination، Idempotency و Concurrency است.
- Eventها از Audit و Notification تفکیک شده‌اند.
- Migration فاقد Drop یا Big Bang و دارای Rollback عملیاتی است.
- تهدیدهای Critical دارای کنترل و تست الزامی هستند.
- هیچ تصمیم معماری بازِ مسدودکننده برای ورود به R2 باقی نمانده است.

## گیت‌های بیرونی منتقل‌شده از R0

Endpoint و Owner سرویس‌های مرجع، Provider پیام، Sign-off حقوقی Retention و SLA و شواهد
زیرساخت Production برای طراحی R1 لازم نیستند، ولی فعال‌سازی قابلیت‌های وابسته در Staging یا
Production بدون آن‌ها No-Go است.
