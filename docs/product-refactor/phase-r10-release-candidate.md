# فاز R10 — نامزد انتشار و آمادگی Go-Live

وضعیت: پیاده‌سازی Repository کامل؛ صدور مجوز Production منوط به شواهد واقعی زیرساخت و تأیید مالکان است

## هدف و مرز فاز

R10 خروجی فازهای R0 تا R9 را به یک تصمیم انتشار قابل ممیزی تبدیل می‌کند. این فاز قرارداد
انتشار، CI، migration، build، runtime و rollback را کنترل می‌کند، اما بدون Provider، Registry،
محیط Staging، Secret Store و مالکان نام‌گذاری‌شده، به‌صورت خودکار مجوز Production صادر نمی‌کند.

هیچ اسکریپت این فاز به دیتابیس Production متصل نمی‌شود، migration اجرا نمی‌کند، feature flag را
روشن نمی‌کند یا secret تولید/تعویض نمی‌کند.

## کنترل‌های افزوده‌شده

- Evidence نامزد انتشار فقط با `DEPLOYMENT_VERSION` برابر SHA کامل ۴۰ کاراکتری و lowercase ساخته می‌شود.
- در GitHub Actions، SHA اعلام‌شده باید با `GITHUB_SHA` همان checkout برابر باشد.
- تمام feature flagهای R2 تا R9 در قرارداد Production حضور دارند و در `.env.example` خاموش هستند.
- تنظیمات عملیاتی SLA، Outbox و Attachment جزو قرارداد اجباری محیط شده‌اند.
- CI دسترسی بدون Token به هر دو maintenance endpoint را با `401` رد می‌کند.
- CI فراخوانی مجاز lifecycle worker را روی دیتابیس disposable اجرا و پاسخ خالی/سالم آن را بررسی می‌کند.
- وجود سند R10، runtime smokeهای R6 تا R9، migrationها و routeهای عملیاتی توسط verifier کنترل می‌شود.
- checksum تمام migrationها در `release-contract.json` ثبت می‌شود؛ تعداد migration در کد hard-code نشده است.

## فرمان‌های Repository

بررسی سریع قرارداد:

```bash
npm run verify:release-contract
npm run test:release-contract
```

ساخت Evidence نامزد انتشار در CI یا checkout متصل به یک commit immutable:

```bash
DEPLOYMENT_VERSION=<full-lowercase-commit-sha> \
node scripts/check-release-readiness.mjs \
  --require-release-id \
  --output release-contract.json
```

فرمان دوم در صورت نبود SHA، استفاده از branch/tag، اختلاف با `GITHUB_SHA` یا نقض هر gate با exit code
غیرصفر متوقف می‌شود. فایل Evidence حاوی secret یا مقدار credential نیست.

## Go/No-Go برای Production

تمام موارد زیر اجباری‌اند:

| Gate | Evidence | مالک تأییدکننده | No-Go |
| --- | --- | --- | --- |
| Source | PR بازبینی‌شده، CI سبز، SHA immutable | Release Owner | bypass شدن check یا source مبهم |
| Artifact | digest مستقل runner/migrator و دو SBOM | Release Owner | rebuild یا استفاده از tag به‌جای digest |
| Database | backup تازه، restore موفق، migration rehearsal و lock time | Database Owner | restore اثبات‌نشده یا lock خارج بودجه |
| Storage/Scan | bucket خصوصی، encryption، retention و تست malware fail-closed | Security/Infrastructure | دسترسی عمومی یا scanner قابل دورزدن |
| Authorization | تست tenant، customer، agent و collaborator scope | Security Owner | هر IDOR یا internal-data leak |
| Lifecycle | اجرای SLA و Ticket Lifecycle scheduler و idempotency | Operations | backlog، cycle تکراری یا auto-close نادرست |
| Observability | dashboard، alert، request-id و on-call acknowledgement | On-call Owner | alert بدون مقصد یا telemetry حساس |
| Capacity | load/smoke روی topology معادل Production | Service Owner | عبور latency/error/resource از بودجه |
| Rollback | digest قبلی، app rollback و DB forward-fix rehearsal | Release Owner | عدم بازیابی در RTO مصوب |

## ترتیب انتشار

1. commit تأییدشده freeze و runner/migrator یک‌بار build شوند.
2. artifactها با digest و SBOM ثبت و همان digestها به Staging منتقل شوند.
3. backup پاک‌سازی‌شده restore و تمام migrationهای موجود Repository روی آن rehearsal شوند.
4. احراز هویت، Scope، lifecycle، فایل خصوصی، scanner، metrics و audit روی Staging تست شوند.
5. rollback اپلیکیشن به digest قبلی و forward-fix دیتابیس rehearsal شود.
6. پس از تأیید تمام مالکان، migrator یک‌بار در Production اجرا شود.
7. runner به‌صورت Canary و با readiness gate منتشر و در observation window پایش شود.
8. feature flagها جداگانه و مرحله‌ای فعال شوند؛ روشن‌کردن هم‌زمان همه flagها مجاز نیست.

## Schedulerهای الزامی

- `POST /api/internal/sla/process`: حداقل هر یک دقیقه
- `POST /api/internal/tickets/lifecycle/process`: حداکثر هر یک ساعت

هر دو مسیر از `SLA_MAINTENANCE_TOKEN` استفاده می‌کنند، ولی rate-limit و audit scope مستقل دارند.
شکست Job، backlog Outbox، dead-letter، cycle فعال تکراری یا auto-close بدون دو reminder باید Alert ایجاد کند.

## وضعیت فعلی تصمیم انتشار

Repository از نظر lint، typecheck، test، build، Prisma، قرارداد انتشار و runtime smoke آمادهٔ ساخت
Release Candidate است. تصمیم Production همچنان **No-Go مشروط** باقی می‌ماند تا Providerها انتخاب،
تصاویر container در CI ساخته و scan، restore/migration rehearsal، load test، alert routing، rollback drill
و تأیید نام‌دار مالکان روی محیط واقعی ثبت شوند. این محدودیت‌ها با دادهٔ محلی قابل جعل یا حذف نیستند.
