# فاز KPI-7 — تیکت به ازای تراکنش

## نتیجه

شاخص KPI-08 با واحد «تیکت به ازای ۱۰۰۰ تراکنش موفق» پیاده‌سازی شد. صورت کسر فقط تیکت‌های یکتای سالم و غیر Legacy است که مرجع کسب‌وکار تأییدشده، هم‌نوع با تراکنش و متعلق به همان Provider دارند. مخرج فقط از سطل‌های روزانه‌ی `VERIFIED` و با پوشش کامل بازه خوانده می‌شود.

## قراردادهای API

- دریافت گزارش: `GET /api/v2/reporting/kpis/ticket-per-transaction`
- پارامترهای اجباری: `from`, `to`, `providerCode`, `transactionType`
- پارامتر اختیاری: `organizationId`
- بازه نیمه‌باز `[from,to)` و هر دو مرز باید نیمه‌شب `Asia/Tehran` باشند.
- فقط دسترسی گزارش سراسری یا audit سراسری مجاز است؛ scope تیمی به مخرج سراسری/سازمانی وصل نمی‌شود.
- نبود پوشش کامل، وجود سطل provisional/rejected یا مخرج صفر، مقدار KPI را با دلیل `DENOMINATOR_UNAVAILABLE` برابر `null` می‌کند.

## ورودی حجم تراکنش

- endpoint خصوصی: `POST /api/internal/reporting/transaction-volumes`
- احراز هویت: Bearer با `REPORTING_MAINTENANCE_TOKEN`
- فعال‌سازی صریح: `FEATURE_TRANSACTION_VOLUME_INGESTION_ENABLED=true`
- شمارنده‌ها رشته‌ی ده‌دهی هستند تا دقت JSON برای BIGINT از بین نرود.
- replay محتوای یکسان idempotent است؛ تغییر محتوای سطل تاریخی با `409` رد می‌شود.
- transitionهای مجاز: `PROVISIONAL -> VERIFIED|REJECTED` و `VERIFIED -> REJECTED`؛ بازگشت وضعیت مجاز نیست.
- checksum در سرور تولید می‌شود و داده‌ی مصنوعی seed نمی‌شود.
- وجود سازمان داخل همان transaction سرویس ingest و در triggerهای insert/update دیتابیس کنترل می‌شود؛ trigger حذف سازمان نیز رفتار restrict را تضمین می‌کند. CHECK دیتابیس سازگاری `scopeType/scopeKey/organizationId` را حفظ می‌کند. این ترکیب جایگزین FK ناسازگار با محدودیت MySQL روی ستون حاضر در CHECK است.

## راه‌اندازی Provider

پیش از فعال‌سازی در production باید مالک Provider، نگاشت نوع تراکنش، SLA تحویل روزانه، سیاست correction، timezone، sandbox و contract test تأیید شود. سپس feed ابتدا در staging ingest و پوشش بازه و checksumها reconcile شود.

## تأیید تکرارپذیر

1. `npx prisma migrate deploy`
2. `npm run test:kpi-r7-ticket-per-transaction`
3. `npm run verify:release-contract`
4. `npm run lint && npm run typecheck && npm run test:ci && npm run build`
