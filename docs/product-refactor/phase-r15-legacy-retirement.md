# فاز R15 — آمادگی Retirement مسیرهای Legacy

وضعیت: پیاده‌سازی Repository کامل؛ حذف واقعی Legacy تا Evidence معتبر و PR مستقل ممنوع است

## هدف و مرز ایمنی

R15 مشخص می‌کند چه زمانی UI، API، compatibility mapping و مسیرهای migration قدیمی می‌توانند وارد
یک تغییر حذف مستقل شوند. خروجی این فاز فقط `READY_TO_RETIRE` یا `KEEP_LEGACY` است.

Validator و Workflow هیچ فایل، route، table، column، object، backup، feature flag یا داده‌ای را حذف
یا تغییر نمی‌دهند. حتی نتیجه `READY_TO_RETIRE` فقط پیش‌شرط ساخت یک PR جداگانه با migration افزایشی،
rollback plan و review جدید است.

## زنجیره immutable Evidence

Workflow زنجیره زیر را اثبات می‌کند:

```text
application release
  -> Go-Live evidence
    -> release closure evidence
      -> Legacy retirement evidence
```

تمام validatorها از commit محصول اجرا می‌شوند و چهار revision باید SHA کامل، lowercase، متفاوت و
ancestor/descendant مستقیم در همان تاریخچه باشند.

Manifest با مسیر دقیق زیر ثبت می‌شود:

```text
legacy-retirement/<full-lowercase-release-commit-sha>.json
```

مسیر دیگر، traversal، فایل غیرعادی، JSON نامعتبر یا حجم بیش از ۲۵۶ KiB fail-closed رد می‌شود.

## Window مشاهده

- observation حداقل ۳۰ روز و حداکثر ۱۸۰ روز است.
- تمام feature flagهای معماری جدید باید پیش از شروع window فعال شده باشند.
- Evidence حداکثر ۲۴ ساعت پس از پایان window ثبت می‌شود.
- approvalها فقط پس از پایان window و پیش از زمان ثبت معتبرند.

هدف این window جلوگیری از حذف شتاب‌زده fallbackها بر اساس چند ساعت یا چند روز ترافیک کم است.

## Feature flagهای الزامی

هر هشت flag باید در کل window وضعیت `ENABLED` و reference دائمی داشته باشند:

- `FEATURE_ORGANIZATION_CONTEXT_ENABLED`
- `FEATURE_SUPPORT_V2_READ_ENABLED`
- `FEATURE_SUPPORT_V2_WRITE_ENABLED`
- `FEATURE_AGENT_WORKSPACE_V2_ENABLED`
- `FEATURE_SLA_ENFORCEMENT_ENABLED`
- `FEATURE_OUTBOX_DISPATCH_ENABLED`
- `FEATURE_BUSINESS_REFERENCE_INTEGRATIONS_ENABLED`
- `FEATURE_CUSTOMER_EXPERIENCE_V2_ENABLED`

## صفر بودن ترافیک و بدهی داده

موارد زیر باید دقیقاً صفر باشند:

- authenticated request و successful write روی Legacy؛
- consumer شناخته‌شده و client پشتیبانی‌نشده؛
- catalog mapping در انتظار؛
- ticket تطبیق‌نیافته؛
- attachment عمومی Legacy؛
- object یتیم؛
- outbox dead letter.

ترافیک bot/health عمومی باید در Traffic Analysis تفکیک شود و هیچ‌گاه به‌جای ترافیک authenticated
گزارش نشود.

## سطح‌های Retirement

شش سطح باید مالک، Evidence و Removal Plan مستقل داشته باشند:

| شناسه | محدوده |
| --- | --- |
| `customer-ui-v1` | تجربه قدیمی کاربر |
| `agent-ui-v1` | پنل قدیمی ادمین/کارشناس |
| `ticket-api-v1` | APIهای compatibility تیکت |
| `legacy-public-attachments` | مسیر و فایل عمومی قدیمی |
| `legacy-catalog-mapping` | نگاشت Department/SubDepartment |
| `legacy-ticket-reconciliation` | worker و backfill تطبیق تیکت |

وضعیت تمام موارد باید `READY_TO_RETIRE` باشد. حذف یک سطح، مجوز حذف سطح دیگر محسوب نمی‌شود.

## Records و Approvalها

چهار مرجع دائمی لازم است: consumer inventory، traffic analysis، data retention plan و تأیید پایان
rollback window. URL دارای credential، query، fragment یا placeholder رد می‌شود.

پنج تأیید یکتا لازم است:

- Product Owner
- Architecture Owner
- Database Owner
- Security Owner
- Service Owner

Manifest نباید secret، token، password، credential، PII، raw log، snapshot دیتابیس، ticket content یا
attachment داشته باشد. report فقط شمارش‌ها، SHA و خطاهای sanitized را نمایش می‌دهد.

## Workflow محافظت‌شده

Workflow `Legacy Retirement Approval` در Environment با نام `legacy-retirement-approval`:

1. چهار SHA و تفاوت revisionهای متوالی را بررسی می‌کند.
2. Retirement revision و application release را exact checkout می‌کند.
3. ancestry کامل را اثبات می‌کند.
4. قرارداد Release، Evidence فاز R12، Closure فاز R14 و Retirement فاز R15 را با کد محصول دوباره
   اجرا می‌کند.
5. سه گزارش sanitized را برای ۳۶۵ روز نگه می‌دارد.

Job فقط `contents: read` دارد و هیچ Production، database، storage، metrics یا deployment credential
دریافت نمی‌کند.

## وضعیت فعلی

به‌دلیل نبود Release/Closure واقعی، observation سی‌روزه، traffic inventory و approvalهای نام‌دار،
هیچ manifest جعلی ساخته نشده است. وضعیت عملیاتی `KEEP_LEGACY` است و تمام fallbackهای موجود حفظ
شده‌اند. پیاده‌سازی Repository فاز R15 کامل است؛ حذف واقعی باید پس از Evidence معتبر در تغییر مستقل
انجام شود.
