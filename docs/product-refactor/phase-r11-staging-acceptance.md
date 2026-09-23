# فاز R11 — تمرین Staging و پذیرش عملیاتی

وضعیت: پیاده‌سازی Repository کامل؛ اجرای واقعی منوط به URL و Secret محیط Staging محافظت‌شده است

## هدف

R11 یک verifier مستقل، محدود و read-only برای بررسی همان artifact تأییدشده در محیط Staging
ارائه می‌کند. این ابزار deploy، migration، seed، ساخت کاربر، تغییر feature flag یا اجرای Job انجام
نمی‌دهد و در صورت هر ابهام، redirect، timeout یا اختلاف نسخه fail-closed می‌شود.

## ورودی‌های محافظت‌شده

| متغیر | منبع | قرارداد |
| --- | --- | --- |
| `STAGING_BASE_URL` | GitHub Environment variable | origin کامل HTTPS، بدون credential/path/query/fragment |
| `STAGING_METRICS_TOKEN` | GitHub Environment secret | مقدار مستقل ۳۲ تا ۵۱۲ کاراکتری |
| `EXPECTED_DEPLOYMENT_VERSION` | workflow input | SHA کامل ۴۰ کاراکتری lowercase |
| `STAGING_REQUEST_TIMEOUT_MS` | workflow | عدد ۱۰۰۰ تا ۳۰۰۰۰؛ پیش‌فرض ۱۰۰۰۰ |
| `STAGING_RELEASE_SAMPLE_COUNT` | workflow | عدد ۳ تا ۲۰؛ پیش‌فرض ۵ |

Token هیچ‌گاه در report، خطا، artifact name یا command output ثبت نمی‌شود. درخواست‌ها redirect را
دنبال نمی‌کنند، حداکثر ۱۲۸ KiB پاسخ می‌خوانند و برای هر درخواست `x-request-id` مستقل می‌فرستند.

## هفت کنترل پذیرش

1. `liveness`: پاسخ ۲۰۰، وضعیت `ok`، request-id و no-store.
2. `readiness`: پاسخ ۲۰۰، وضعیت `ready`، request-id و no-store.
3. `security-headers`: HSTS، CSP، frame، MIME، referrer، opener و permissions policy.
4. `application-shell`: صفحهٔ `/` واقعاً HTML، RTL، بدون redirect و فاقد cache قدیمی باشد.
5. `metrics-access-control`: metrics بدون credential دقیقاً `401` باشد.
6. `metrics-and-release-consistency`: حداقل پنج نمونه authenticated همگی ready و روی همان SHA باشند.
7. `maintenance-method-boundaries`: probe فقط‌خواندنی GET روی هر دو Job دقیقاً `405` برگرداند.

نمونه‌برداری چندباره اختلاف replicaهای rollout را آشکار می‌کند. این کنترل جایگزین مشاهدهٔ مستقیم
digest در orchestrator نیست، اما mixed deployment یا replica قدیمی قابل دسترسی را به No-Go تبدیل می‌کند.

## اجرای Workflow

Workflow با نام `Staging Rehearsal` فقط به‌صورت دستی و در GitHub Environment محافظت‌شده اجرا
می‌شود. خروجی `staging-rehearsal.json` حتی هنگام شکست برای ۳۰ روز نگهداری و خود Job ناموفق باقی
می‌ماند. اجرای محلی با secret واقعی در command line یا shell history مجاز نیست؛ secret باید توسط
secret store تزریق شود.

## معیار پذیرش

- هر هفت check باید `pass` باشند.
- `expectedDeploymentVersion` باید همان SHA موجود در Release Candidate و image digest record باشد.
- container/SBOM/scan، restore/migration rehearsal، فایل خصوصی/ClamAV، load test، alert routing و
  rollback drill باید Evidence جداگانه R10 داشته باشند.
- Database، Security، Infrastructure، On-call و Release Owner باید با نام و زمان تأیید کنند.

تا قبل از این شواهد، نتیجهٔ Repository به معنی آمادگی verifier است، نه اجازهٔ Production.

## Failure و No-Go

- هر redirect یا پاسخ بیش از سقف حجم
- liveness سالم ولی readiness ناموفق
- نبود header امنیتی یا metrics عمومی
- صفحه‌ای که shell HTML/RTL برنامه نیست
- حتی یک نمونه با SHA متفاوت یا `ticketing_ready 0`
- پاسخ GET غیر از `405` برای maintenance endpointها
- نبود Evidence بیرونی یا تأیید مالک

در شکست، report نگهداری، request-idها با logها correlate و علت رفع می‌شود؛ retry بدون تحلیل یا waiver
خودکار مجاز نیست.
