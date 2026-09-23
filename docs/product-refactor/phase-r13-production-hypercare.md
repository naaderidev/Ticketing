# فاز R13 — تأیید پس از استقرار و Hypercare

وضعیت: پیاده‌سازی Repository کامل؛ اجرای واقعی منوط به استقرار مصوب R12 و دسترسی read-only محیط
`production-observation` است

## هدف و مرز ایمنی

R13 بعد از Cutover، پایداری همان artifact تأییدشده را در سه checkpoint با نام‌های `initial`،
`midpoint` و `closure` بررسی می‌کند. این فاز فقط درخواست‌های `GET` به shell عمومی، health و metrics
می‌فرستد و برای endpointهای maintenance نیز فقط GET غیرمجاز را probe می‌کند.

Verifier تیکت، کاربر، پیام، فایل، دیتابیس، feature flag، queue، scheduler یا ترافیک را تغییر نمی‌دهد؛
rollback نیز خودکار نیست. هر شکست نتیجه را به `ROLLBACK_REVIEW_REQUIRED` تبدیل می‌کند تا Incident
Commander و Release Owner درباره توقف rollout یا rollback تصمیم بگیرند.

## ورودی‌های محافظت‌شده

| ورودی | منبع | قرارداد |
| --- | --- | --- |
| `PRODUCTION_BASE_URL` | Environment variable | origin دقیق HTTPS؛ بدون path/query/credential/fragment |
| `PRODUCTION_METRICS_TOKEN` | Environment secret | ۳۲ تا ۵۱۲ کاراکتر ASCII قابل‌چاپ |
| `EXPECTED_DEPLOYMENT_VERSION` | workflow input | SHA کامل lowercase همان release |
| `PRODUCTION_CHECKPOINT` | workflow input | فقط `initial`، `midpoint` یا `closure` |
| `PRODUCTION_OBSERVATION_COUNT` | workflow | ۲ تا ۱۲؛ مقدار workflow برابر ۳ |
| `PRODUCTION_OBSERVATION_INTERVAL_MS` | workflow | ۱۰۰۰ تا ۳۰۰۰۰۰؛ کل window حداکثر ۱۵ دقیقه |
| `PRODUCTION_RELEASE_SAMPLE_COUNT` | workflow | ۳ تا ۲۰؛ مقدار workflow برابر ۵ |
| `PRODUCTION_REQUEST_TIMEOUT_MS` | workflow | ۱۰۰۰ تا ۳۰۰۰۰؛ مقدار workflow برابر ۱۰۰۰۰ |

Token در report، خطا، artifact name یا log چاپ نمی‌شود. پاسخ‌ها بیش از ۱۲۸ KiB خوانده نمی‌شوند،
redirect دنبال نمی‌شود و هر درخواست request-id مستقل دارد.

## کنترل هر Observation

هر checkpoint سه observation دارد و هر observation هفت کنترل R11 را دوباره روی Production اجرا
می‌کند:

1. liveness برابر `ok` و بدون cache؛
2. readiness برابر `ready` و بدون cache؛
3. تمام headerهای امنیتی مصوب؛
4. shell واقعی HTML، فارسی/RTL و بدون cache قدیمی؛
5. metrics بدون token دقیقاً `401`؛
6. پنج نمونه authenticated با `ticketing_ready 1` و SHA دقیق release؛
7. GET روی هر دو endpoint maintenance دقیقاً `405`.

در نتیجه هر checkpoint حداقل ۱۵ نمونه release identity می‌گیرد. اولین observation ناموفق، checkpoint
را متوقف می‌کند تا verifier به‌صورت retry کور یا فشار اضافه روی محیط معیوب عمل نکند.

## ترتیب Checkpointها

- `initial`: پس از ورود replicaهای جدید به ترافیک و پیش از گسترش feature flagها؛
- `midpoint`: در نیمه window مصوب Hypercare و پس از بررسی alert، backlog و business KPI؛
- `closure`: در انتهای window، فقط وقتی Incident فعال و breach حل‌نشده وجود ندارد.

موفقیت یک checkpoint جایگزین دو checkpoint دیگر نیست. `OBSERVATION_PASS` فقط سلامت probeهای همین
اجرا را ثبت می‌کند و به‌تنهایی مجوز بستن release نیست.

## Workflow محافظت‌شده

Workflow `Production Post-Deployment Verification` در Environment مستقل
`production-observation` اجرا می‌شود و:

1. `release_id` و `evidence_revision` را به SHA کامل محدود می‌کند؛
2. هر دو commit را دقیق checkout و ancestry آن‌ها را اثبات می‌کند؛
3. Go-Live Evidence فاز R12 را با کد commit محصول دوباره اعتبارسنجی می‌کند؛
4. verifier Production را نیز از همان commit محصول اجرا می‌کند؛
5. گزارش Go-Live و observation را حتی هنگام شکست برای ۹۰ روز نگه می‌دارد.

Environment باید فقط secret خواندن metrics را داشته باشد و نباید credential استقرار، دیتابیس، object
storage، scheduler یا cloud control-plane در اختیار این Job قرار دهد.

## شرایط توقف و Escalation

- هر release mismatch یا mixed replica؛
- readiness یا `ticketing_ready` ناموفق؛
- redirect، timeout، پاسخ بزرگ یا request-id شکسته؛
- header امنیتی ناقص یا metrics عمومی؛
- maintenance endpoint قابل‌اجرا با GET؛
- نبود/ابطال Evidence مصوب R12؛
- incident امنیتی یا data-integrity، Sev-1/Sev-2 باز، backlog بحرانی یا breach ظرفیت.

خروجی ناموفق باید حفظ و با dashboard، log و trace متناظر بررسی شود. rollback فقط به digest ثبت‌شده
R12 و با تصمیم انسان مسئول انجام می‌شود؛ migration معکوس خودکار ممنوع و schema defect نیازمند
forward-fix مصوب است.

## معیار Closure واقعی

Closure عملیاتی فقط وقتی مجاز است که هر سه artifact این فاز `OBSERVATION_PASS` باشند و On-call،
Service Owner و Release Owner نبود incident باز، data loss، security breach، SLA regression و customer
impact حل‌نشده را در سامانه تغییرات سازمان ثبت کنند. Repository هیچ‌یک از این شواهد بیرونی را جعل
نمی‌کند.

در محیط فعلی Production URL، metrics secret، deployment SHA و artifactهای checkpoint وجود ندارند؛
بنابراین پیاده‌سازی verifier کامل است ولی وضعیت release closure همچنان `PENDING_EXTERNAL_EVIDENCE`
باقی می‌ماند.
