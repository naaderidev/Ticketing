# فاز R12 — حاکمیت Cutover و تأیید Production

وضعیت: پیاده‌سازی Repository کامل؛ Production تا ثبت Evidence واقعی و approval محیط محافظت‌شده No-Go است

## هدف و مرز اختیار

R12 آخرین مرز میان «نامزد انتشار سالم» و «مجوز تغییر Production» است. این فاز Evidenceهای R10 و
R11 را به یک manifest نسخه‌دار و قابل بازبینی تبدیل می‌کند و فقط در صورت کامل‌بودن همهٔ کنترل‌ها
نتیجه `GO` می‌دهد.

Workflow این فاز هیچ imageای deploy نمی‌کند، migration اجرا نمی‌کند، ترافیک تغییر نمی‌دهد و feature
flag روشن نمی‌کند. اجرای واقعی Cutover باید توسط مالک Release، در change window مصوب و با ابزار
زیرساخت منتخب انجام شود.

## فایل Evidence

هر Release دقیقاً یک فایل با مسیر زیر دارد. این فایل در یک commit شواهد جداگانه ثبت می‌شود تا
وابستگی دوری میان SHA نامزد انتشار و محتوای Evidence ایجاد نشود:

```text
release-evidence/<full-lowercase-40-character-commit-sha>.json
```

Manifest فقط reference دائمی به Evidence نگه می‌دارد؛ secret، token، password، credential، signed
URL، PII، raw log، snapshot دیتابیس یا فایل مشتری در Repository مجاز نیست.

فیلدهای اجباری:

- `schemaVersion: 1`
- `releaseId`: SHA کامل commit
- `decision: "GO"`
- `recordedAt`: زمان UTC پیش از شروع change window
- `productionOrigin`: origin دقیق HTTPS
- `changeWindow.startsAt/endsAt`: بازه UTC حداکثر ۲۴ ساعت
- `artifacts`: digestهای runner، migrator و runner قبلی به‌همراه SBOM و scan references
- `staging`: همان releaseId، گزارش R11 و زمان تکمیل
- `recoveryObjectives`: مقادیر مثبت `rpoMinutes` و `rtoMinutes`
- `gates`: تمام Gateهای اجباری با `PASS`، Evidence دائمی و Owner نام‌دار

## Gateها و مالک اجباری

| شناسه | مالک |
| --- | --- |
| `source` | Release Owner |
| `artifact` | Release Owner |
| `secrets` | Security Owner |
| `database` | Database Owner |
| `storage` | Infrastructure Owner |
| `malwareScan` | Security Owner |
| `network` | Infrastructure Owner |
| `authorization` | Security Owner |
| `lifecycle` | Operations Owner |
| `observability` | On-call Owner |
| `capacity` | Service Owner |
| `rollback` | Release Owner |

Gate حذف‌شده، تکراری، ناموفق، دارای Role اشتباه، بدون Evidence یا با approval پس از زمان ثبت، کل
تصمیم را به `NO_GO` تبدیل می‌کند. digest rollback باید با runner جدید متفاوت باشد.

## اعتبارسنجی محلی امن

```bash
EXPECTED_RELEASE_ID=<full-commit-sha> \
GO_LIVE_EVIDENCE_PATH=release-evidence/<full-commit-sha>.json \
npm run verify:go-live-evidence
```

مسیر ورودی فقط نام دقیق همان Release را می‌پذیرد؛ absolute path و traversal رد می‌شوند. فایل باید
JSON عادی و حداکثر ۲۵۶ KiB باشد. گزارش خروجی فقط SHA، تصمیم، شمار Gateها و خطاهای بدون secret را
نمایش می‌دهد.

## Workflow محافظت‌شده

Workflow با نام `Go-Live Evidence Approval` باید روی GitHub Environment با نام
`production-approval` و Required Reviewerهای واقعی اجرا شود. Workflow:

1. `release_id` و `evidence_revision` را فقط به‌شکل SHA کامل می‌پذیرد.
2. commit شواهد و commit محصول را جداگانه و دقیق checkout می‌کند.
3. اثبات می‌کند commit شواهد descendant نامزد انتشار است؛ بنابراین Evidence روی تاریخچهٔ همان
   Release ثبت شده ولی SHA محصول را تغییر نمی‌دهد.
4. SHA هر دو checkout را مستقل مقایسه می‌کند.
5. Release Contract را با کد خود commit محصول اجرا می‌کند؛ نه با کد قابل‌تغییر commit شواهد.
6. Evidence همان `release_id` را بدون deploy اعتبارسنجی می‌کند.
7. گزارش موفق یا ناموفق را برای ۹۰ روز نگه می‌دارد.

وجود approval این Workflow مجوز عمومی یا خودکار deploy نیست؛ فقط ثبت می‌کند Evidence ارائه‌شده با
قرارداد Repository سازگار است.

## ترتیب Cutover عملیاتی

1. تأیید freshness آخرین backup/restore و سلامت replicaها.
2. freeze تغییرات و ثبت runner/migrator/previous-runner digest.
3. اجرای migrator به‌صورت job یکتا و توقف فوری در هر خطا.
4. تأیید `prisma migrate status` پیش از ورود runner جدید به ترافیک.
5. Canary یک cohort کوچک با readiness gate و connection draining.
6. مشاهده error، latency، saturation، DB، outbox، SLA و lifecycle در window مصوب.
7. گسترش تدریجی replicaها و سپس feature flagها؛ هر flag یک تصمیم مستقل دارد.
8. اجرای smoke امن Production و ثبت نتیجه نهایی.

## Rollback و Stop Conditions

- rollback اپلیکیشن فقط به `previousRunnerDigest` ثبت‌شده انجام می‌شود.
- migration معکوس خودکار ممنوع است؛ schema defect با forward-fix مصوب اصلاح می‌شود.
- corruption یا data loss فقط با incident procedure و restore checkpoint معتبر پاسخ داده می‌شود.
- هر IDOR، نشت Internal Note، scanner bypass، migration drift، readiness failure، mixed release،
  backlog بحرانی، auto-close نادرست یا breach بودجه ظرفیت فوراً rollout را متوقف می‌کند.

## وضعیت فعلی

Validator، تست‌ها و Workflow آماده‌اند، اما چون Provider، Repository remote، image digestها، URL
Staging/Production، Evidenceهای backup/load/alert/rollback و Owner approval واقعی در این محیط ارائه
نشده‌اند، هیچ manifest جعلی ساخته نشده و تصمیم Production همچنان `NO_GO` است.
