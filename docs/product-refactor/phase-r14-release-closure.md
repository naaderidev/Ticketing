# فاز R14 — بستن رسمی Release و تحویل به عملیات پایدار

وضعیت: پیاده‌سازی Repository کامل؛ Release واقعی تا ثبت شواهد بیرونی معتبر `KEEP_OPEN` است

## هدف و مرز اختیار

R14 آخرین مرحلهٔ audit و handoff پس از Hypercare است. این فاز خروجی‌های R12 و R13 را با وضعیت
رخدادها، SLA، ظرفیت، customer impact و تأیید مالکان ترکیب می‌کند و فقط در نبود ریسک باز اجازه ثبت
`CLOSE` می‌دهد.

Workflow هیچ deploy، rollback، migration، تغییر feature flag، فراخوانی Production، ویرایش ticket یا
عملیات cloud control-plane انجام نمی‌دهد. این مرحله فقط اسناد immutable را اعتبارسنجی می‌کند.

## زنجیره Evidence

سه revision مستقل باید یک زنجیره ancestry خطی بسازند:

```text
application release commit
  -> approved Go-Live evidence revision
    -> release closure evidence revision
```

این ساختار مانع از تغییر SHA artifact برای افزودن approvalهای بعدی می‌شود. Validatorها همیشه از
commit خود محصول اجرا می‌شوند تا commit شواهد نتواند قواعد پذیرش را تغییر دهد.

هر Release دقیقاً یک Closure manifest دارد:

```text
release-closure/<full-lowercase-release-commit-sha>.json
```

فایل حداکثر ۲۵۶ KiB است و مسیر absolute، traversal یا نامی غیر از SHA همان Release رد می‌شود.

## قرارداد زمانی

- `deployedAt` پیش از شروع Hypercare یا هم‌زمان با آن است.
- `hypercareStartedAt` تا `hypercareEndedAt` حداقل ۲۴ ساعت و حداکثر ۷ روز است.
- checkpointها باید دقیقاً به ترتیب `initial`، `midpoint` و `closure` تکمیل شوند.
- هر checkpoint داخل window و دارای status برابر `OBSERVATION_PASS` است.
- Closure record حداکثر ۲۴ ساعت پس از پایان Hypercare ثبت می‌شود.
- تمام approvalها بعد از پایان Hypercare و پیش از `recordedAt` هستند.

## Operational Review اجباری

برای `CLOSE` تمام شرایط زیر لازم است:

| کنترل | مقدار الزامی |
| --- | --- |
| `openSev1` | `0` |
| `openSev2` | `0` |
| `unresolvedSecurityIncidents` | `0` |
| `unresolvedDataIntegrityIncidents` | `0` |
| `unresolvedCustomerImpact` | `0` |
| `unresolvedSlaRegressions` | `0` |
| `alertsStable` | `true` |
| `backlogWithinCapacity` | `true` |
| `rollbackTriggered` | `false` |

اگر rollback انجام شده باشد، آن release قابل بستن نیست؛ rollout جایگزین باید Release ID و چرخه
Evidence مستقل داشته باشد.

## Records و Approvalها

چهار reference دائمی HTTPS برای change record، incident review، monitoring review و customer impact
review لازم است. URL دارای credential، query، fragment یا placeholder رد می‌شود.

سه تأیید یکتا و نام‌دار لازم است:

- `On-call Owner`
- `Service Owner`
- `Release Owner`

secret، token، password، credential، private/access key، PII، raw log، snapshot دیتابیس یا محتوای
incident در manifest مجاز نیست. گزارش validator فقط SHA، تصمیم، شمار checkpoint/approval و خطاهای
sanitized را نگه می‌دارد.

## Workflow محافظت‌شده

Workflow `Production Release Closure` در Environment با نام `production-closure` اجرا می‌شود:

1. هر سه SHA را قبل از checkout اعتبارسنجی می‌کند.
2. Closure revision و application release را دقیق checkout می‌کند.
3. ancestry کامل `release → Go-Live evidence → closure evidence` را اثبات می‌کند.
4. Release Contract فاز R10، Go-Live Evidence فاز R12 و Closure Evidence فاز R14 را با کد محصول
   دوباره اجرا می‌کند.
5. گزارش موفق یا ناموفق را برای ۳۶۵ روز نگه می‌دارد.

این Environment فقط به `contents: read` نیاز دارد و نباید هیچ Production secret یا deployment
credential داشته باشد. Required Reviewerهای آن باید مطابق سه Role بالا تنظیم شوند.

## نتیجه و وضعیت فعلی

تصمیم `CLOSE` فقط نشان می‌دهد انتشار مشخص‌شده چرخه Hypercare و review خود را با شواهد کامل بسته است؛
این تصمیم مجوز deploy بعدی یا حذف backup/Evidence نیست و retention policy سازمان همچنان حاکم است.

در محیط فعلی هیچ release واقعی، سه checkpoint R13، incident/customer review یا approval نام‌دار
ارائه نشده است. بنابراین manifest جعلی ساخته نشده و وضعیت عملیاتی release برابر `KEEP_OPEN` باقی
می‌ماند، هرچند پیاده‌سازی Repository فاز R14 کامل است.
