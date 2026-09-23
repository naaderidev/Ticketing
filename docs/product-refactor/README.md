# بسته مستندات بازطراحی محصول

وضعیت کلی: پیاده‌سازی Repository فازهای R0 تا R15 کامل؛ Retirement واقعی Legacy همچنان منوط به
Closure معتبر R14، observation سی‌روزه و Evidence نام‌دار R15 است

این پوشه خط‌مبنای محصول جدید را پیش از هر تغییر Schema، API یا UI نگه می‌دارد.

## ترتیب بررسی

1. `phase-r0-product-baseline.md` — هدف، Scope و معیار خروج
2. `r0-baseline-v1.md` — Manifest نسخه تأییدشده و گیت‌های باقی‌مانده
3. `r0-approval-pack.md` — انتخاب و دلیل تمام تصمیم‌ها
4. `decision-register.md` — تصمیم‌های مصوب و سابقه تأیید
5. `request-taxonomy-routing-sla.md` — موضوعات، تیم ورودی، Priority و SLA پیشنهادی
6. `journeys-and-lifecycle.md` — پنج Journey و State Machine
7. `access-and-data-classification.md` — نقش‌ها، Scope و داده حساس
8. `integration-inventory.md` — سرویس‌های مرجع و رفتار زمان اختلال
9. `kpi-definitions.md` — تعریف قابل اندازه‌گیری KPIها
10. `risk-register.md` — ریسک‌ها، کنترل و معیار توقف

## خروجی‌های فاز R1

11. `phase-r1-architecture.md` — نتیجه و معیار خروج معماری
12. `r1-baseline-v1.md` — Manifest معماری و قرارداد ورود به R2
13. `architecture-and-modules.md` — مرز ماژول‌ها و ساختار هدف
14. `architecture-decisions.md` — ADRهای مصوب
15. `api-v2-contract.md` — قرارداد HTTP نسخه جدید
16. `event-catalog.md` — Event envelope و فهرست رویدادها
17. `migration-and-rollout.md` — نقشه مهاجرت و Feature Flag
18. `threat-model.md` — تهدیدها و کنترل‌های اجباری

## خروجی فاز R2

19. `phase-r2-party-organization-access.md` — مدل، API، Migration، کنترل امنیتی و شواهد R2

## خروجی فاز R3

20. `phase-r3-support-catalog-team-queue.md` — کاتالوگ، Team/Queue، Routing نسخه‌دار، Migration و شواهد R3

## خروجی فاز R4

21. `phase-r4-ticket-core-state-machine.md` — Ticket Aggregate، State Machine، API v2، dual-write، Outbox و شواهد R4

## خروجی فاز R5

22. `phase-r5-sla-routing.md` — Policy/Calendar نسخه‌دار، snapshot، pause/resume، escalation، consumer و شواهد R5

## خروجی فاز R6

23. `phase-r6-business-reference-integrations.md` — Port/Adapter، قرارداد Provider، snapshot حداقلی، API جست‌وجو، Migration و گیت فعال‌سازی

## خروجی فاز R7

24. `phase-r7-customer-experience.md` — داشبورد، ایجاد، فهرست، جزئیات، تعامل lifecycle و rollout رابط مشتری v2

## خروجی فاز R8

25. `phase-r8-agent-workspace.md` — صف، Workspace DTO، عملیات کارشناس، همکاری داخلی، RBAC و rollout

## خروجی فاز R9

26. `phase-r9-ticket-lifecycle.md` — Resolution Cycle، یادآوری، Auto-close، Reopen و تکمیل Work Item

## خروجی فاز R10

27. `phase-r10-release-candidate.md` — قرارداد نامزد انتشار، Evidence immutable، Go/No-Go، Scheduler و Rollback

## خروجی فاز R11

28. `phase-r11-staging-acceptance.md` — پذیرش read-only محیط Staging، ثبات نسخه بین Replicaها و Evidence عملیاتی

## خروجی فاز R12

29. `phase-r12-production-cutover.md` — Manifest انتشار، approval محافظت‌شده، RPO/RTO و Stop/Rollback contract

## خروجی فاز R13

30. `phase-r13-production-hypercare.md` — تأیید read-only پس از استقرار، checkpointهای Hypercare و مرز Closure

## خروجی فاز R14

31. `phase-r14-release-closure.md` — زنجیره immutable شواهد، Operational Review و handoff رسمی Release

## خروجی فاز R15

32. `phase-r15-legacy-retirement.md` — گیت حذف Legacy، صفرشدن مصرف/بدهی داده و Removal Planهای مستقل

## خروجی برنامه Reporting

33. `phase-kpi-0-contract.md` — قرارداد نسخه‌دار ۹ KPI، Scope، کیفیت داده و گیت ورود به طراحی Schema
34. `phase-kpi-1-reporting-schema.md` — مدل‌های additive Reporting، Migration، constraint، index و شواهد Drift صفر
35. `phase-kpi-2-domain-events.md` — قرارداد typed Event، Snapshot امن Outbox، Replay/Alias و idempotency
36. `phase-kpi-3-reporting-projection.md` — Consumer مستقل، Fact تیکت، checkpoint/lease، gap، replay و rebuild
37. `phase-kpi-4-time-resolution-sla.md` — API تجمیعی زمان پاسخ اول، زمان حل، SLA، Scope، freshness و Data Quality
38. `phase-kpi-5-fcr-reopen-csat.md` — محاسبه FCR، بازگشایی و CSAT با پنجره بلوغ و آستانه انتشار
39. `phase-kpi-6-automated-resolution-infrastructure.md` — Journey حل خودکار و قرارداد ثبت نتیجه
40. `phase-kpi-7-ticket-per-transaction.md` — مخرج تراکنش نسخه‌دار و شاخص تیکت به ازای تراکنش
41. `phase-kpi-8-recurring-problems.md` — رتبه‌بندی موضوع و تشخیص مشکلات پرتکرار
42. `phase-kpi-9-reporting-api-access.md` — API نهایی گزارش، Scope، Drill-down و Export امن
43. `phase-kpi-10-management-dashboard.md` — داشبورد مدیریتی ۹ KPI، فیلتر، Data Quality و Export

نسخه معنایی فعلی شاخص‌ها `KPI-V1` است. تکمیل این سند به معنی آماده‌بودن Dashboard نیست؛
پیاده‌سازی API تجمیعی، UI و اتصال منابع خارجی در فازهای بعدی Reporting انجام می‌شود.

## قواعد تغییر

- عبارت `پیشنهادی` تعهد محصول یا قرارداد نیست.
- تصمیمی با وضعیت `BLOCKING` قبل از فاز وابسته باید بسته شود.
- تصمیم نهایی باید نام مسئول، تاریخ، دلیل و مرجع تأیید داشته باشد.
- اختلاف میان این اسناد باید پیش از تغییر کد حل شود.
- ماتریس USER/ADMIN فعلی تا زمان Migration رسمی همچنان سیاست اجرایی سامانه است.

## Definition of Done فاز R0

- تمام تصمیم‌های BLOCKING بسته شده باشند.
- پنج Journey و موضوعات V1 نهایی شده باشند.
- Team Owner، SLA و مسیر Escalation هر موضوع مشخص باشد.
- نقش‌ها، Scope سازمانی و داده حساس به تأیید امنیت/حقوقی رسیده باشند.
- تمام Integrationهای V1 دارای Owner و Contract قابل تست باشند.
- KPIها تعریف محاسباتی و منبع داده مشخص داشته باشند.
- Risk Register برای همه ریسک‌های Critical/High کنترل و Owner داشته باشد.

## Definition of Done فاز R1

- معماری Modular Monolith و مرز ماژول‌ها ثبت شده باشد.
- API v2، error shape، pagination، idempotency و concurrency contract مشخص باشد.
- Event، Audit و Outbox مسئولیت و schema مستقل داشته باشند.
- Migration و rollout فاقد Big Bang و دارای feature flag و No-Go باشد.
- Threat Model برای tenant، داده حساس، فایل، provider و عملیات هم‌زمان وجود داشته باشد.
- قرارداد ورود به R2 در `r1-baseline-v1.md` ثبت شده باشد.

## Definition of Done فاز R2

- Party/Organization/Membership/Role Assignment فقط به‌صورت additive اضافه شده باشد.
- User/Session و API legacy تا Cutover سازگار باقی مانده باشند.
- Cross-tenant، Context جعلی، self-approval و آخرین مدیر تست شده باشند.
- مشاهده و mutation حساس دارای Audit باشد.
- Feature Flag در Production به‌صورت fail-closed عمل کند.
- Migration apply/reconcile و تمام گیت‌های build/test پاس شده باشند.

## Definition of Done فاز R3

- Service/RequestType/Team/Queue و Route نسخه‌دار فقط به‌صورت additive ایجاد شده باشند.
- هر نوع درخواست فعال دقیقاً یک Route فعال داشته باشد.
- Workspace فقط صف‌های Scopeشده کاربر را برگرداند و اطلاعات داخلی از Catalog مشتری حذف شود.
- تطبیق Department/SubDepartment فقط با تصمیم صریح بازبین انجام شود.
- Feature Flagهای Production fail-closed، Audit و rate limit برقرار باشند.
- Migration apply/reconcile و گیت‌های runtime/build/test پاس شده باشند.

## Definition of Done فاز R4

- Ticket به Party، Organization، RequestType، Team و Queue متصل و Legacy data بدون حدس backfill شده باشد.
- Message، Event، Assignment، Business Reference و Idempotency Receipt در مرز تراکنش Ticket باشند.
- State Machine، ETag/If-Match، Idempotency و Customer scope در API v2 enforce شوند.
- تمام writeهای legacy در همان transaction به مدل canonical و Outbox نیز نوشته شوند.
- داده داخلی از Customer DTO/Timeline حذف و فایل‌ها به Message canonical متصل شده باشند.
- Migration apply/reconcile، runtime smoke، build، lint، typecheck و test پاس شده باشند.

## Definition of Done فاز R5

- هر Ticket دارای snapshot SLA و حداقل یک تصمیم Routing قابل ممیزی باشد.
- Policy/Calendar نسخه‌دار باشد و transfer یا owner change، SLA را reset نکند.
- Pause فقط برای `WAITING_USER` باشد و resume/resolve هیچ pause فعالی باقی نگذارد.
- Thresholdهای ۷۰/۹۰/۱۰۰/۱۲۵ دقیقاً یک‌بار و با compare-and-set ثبت شوند.
- Outbox consumer دارای ترتیب per-aggregate، claim اتمیک، retry محدود و dead-letter باشد.
- حالت پیش‌فرض observe-only و هر دو feature flag در Production fail-closed باشند.
- Migration apply/reconcile، runtime smoke، build، lint، typecheck و test پاس شده باشند.

## Definition of Done فاز R6

- هیچ تماس شبکه‌ای در transaction دیتابیس انجام نشود و replay موفق پیش از Provider پاسخ داده شود.
- پاسخ Provider به context و نسخه قرارداد bind و با schema سخت‌گیرانه اعتبارسنجی شود.
- فقط snapshot حداقلی و Mask‌شده با source/entity/externalId/زمان/Version یا ETag ذخیره شود.
- lookup خارج Scope و Provider خاموش fail-closed باشد و داده نیمه‌کاره ایجاد نکند.
- Flag در تمام محیط‌ها default خاموش و پیکربندی Production فقط HTTPS و secret مستقل بپذیرد.
- Migration apply/reconcile، runtime smoke، build، lint، typecheck و test پاس شده باشند.

## Definition of Done فاز R7

- چهار مسیر اصلی مشتری پشت Feature Flag مستقل به Catalog، Context و Ticket API v2 متصل باشند.
- ایجاد، attachment، reply و lifecycle command دارای Idempotency و optimistic concurrency باشند.
- UI فقط وضعیت‌ها و Timeline عمومی را نشان دهد و هیچ داده داخلی یا cross-context افشا نشود.
- Reference الزامی هنگام خاموشی Provider fail-closed باشد و هیچ fallback حدسی وجود نداشته باشد.
- UI legacy برای rollback باقی بماند و runtime smoke، browser verification، build، lint، typecheck و test پاس شوند.

## Definition of Done فاز R8

- Workspace صف‌محور، DTO داخلی و عملیات assign/transfer/reply/resolve پشت Flag مستقل فعال باشند.
- Team scope و collaborator scope در سرور enforce و Internal Note از Customer API حذف شده باشد.
- optimistic concurrency، idempotency، Audit و rollback به UI قدیم برقرار باشد.
- runtime smoke، browser verification، build، lint، typecheck و test پاس شوند.

## Definition of Done فاز R9

- هر Resolve یک Resolution Cycle تاریخچه‌دار با دو reminder و Auto-close روز کاری سوم بسازد.
- Confirm، Reject و Reopen با پنجره هفت‌روزه و transition معتبر اجرا شوند.
- Work Item قابل تکمیل/لغو و دسترسی Team همکار موقت و حداقلی باشد.
- maintenance endpoint امن، migration افزایشی و runtime smoke پاس شده باشند.

## Definition of Done فاز R10

- Evidence نامزد انتشار فقط به SHA کامل commit و checkout همان SHA bind شود.
- CI هر دو image، SBOM، vulnerability، disposable migration و هر دو maintenance endpoint را بررسی کند.
- تمام feature flagها در قرارداد Production موجود و به‌صورت fail-closed خاموش باشند.
- checksum تمام migrationها، build، lint، typecheck، test و قرارداد release سبز باشند.
- تا زمان تکمیل restore، load، alert، rollback و تأیید مالکان، وضعیت Production صریحاً No-Go بماند.

## Definition of Done فاز R11

- فقط HTTPS origin بدون path، credential، query یا redirect پذیرفته شود.
- release فقط با SHA کامل commit و حداقل سه نمونه سازگار از Replicaها پذیرفته شود.
- liveness، readiness، headerها، shell واقعی RTL، metrics و method boundary هر دو Job پاس شوند.
- response size، timeout و secret redaction fail-closed و تست‌شده باشند.
- Evidence شکست نیز نگهداری شود و بدون شواهد بیرونی و تأیید مالکان، Production همچنان No-Go بماند.

## Definition of Done فاز R12

- Manifest فقط به SHA و digestهای immutable و گزارش R11 همان Release bind شود.
- تمام دوازده Gate دارای Evidence دائمی، وضعیت PASS و Owner با Role مصوب باشند.
- secret، placeholder، signed URL، path traversal و Evidence ناقص fail-closed رد شوند.
- change window، RPO/RTO، rollback digest و forward-fix policy صریح باشند.
  - Workflow، SHA محصول و SHA مستقل Evidence را checkout کند، ancestry آن‌ها را اثبات کند و
    validator را فقط از commit محصول اجرا کند.
  - نبود Evidence واقعی به‌جای approval فرضی، صریحاً `NO_GO` باقی بماند.

## Definition of Done فاز R13

- verifier فقط endpointهای read-only را فراخوانی کند و credential عملیاتی نداشته باشد.
- checkpoint فقط یکی از `initial`، `midpoint` و `closure` باشد.
- هر checkpoint چند observation و چند نمونه release identity محدود داشته باشد.
- اولین شکست sampling را متوقف و `ROLLBACK_REVIEW_REQUIRED` ثبت کند.
- workflow پیش از تماس با Production، Evidence فاز R12 و ancestry دو SHA را دوباره بررسی کند.
- گزارش‌ها secret-free و immutable باشند و ۹۰ روز نگهداری شوند.
- نبود سه checkpoint و شواهد بیرونی، صریحاً `PENDING_EXTERNAL_EVIDENCE` باقی بماند.

## Definition of Done فاز R14

- ancestry کامل Release، Go-Live Evidence و Closure Evidence اثبات شود.
- Hypercare حداقل ۲۴ ساعت و حداکثر ۷ روز و checkpointها مرتب و موفق باشند.
- تمام incident/SLA/data/customer counters صفر و alert/capacity سالم باشند.
- rollback انجام‌شده اجازه بستن همان Release را ندهد.
- سه مالک مصوب بعد از پایان Hypercare approval دائمی ثبت کنند.
- Workflow فاقد Production credential و فقط دارای `contents: read` باشد.
- نبود Evidence واقعی به‌صورت `KEEP_OPEN` باقی بماند.

## Definition of Done فاز R15

- زنجیره Release تا Retirement Evidence با چهار SHA مستقل اثبات شود.
- هشت feature flag پیش از observation حداقل سی‌روزه فعال باشند.
- ترافیک authenticated، write، consumer و client Legacy صفر باشد.
- تمام backlogهای mapping، ticket، attachment، object و outbox صفر باشند.
- هر شش سطح Legacy مالک، Evidence و Removal Plan مستقل داشته باشد.
- پنج مالک مصوب پس از observation تأیید کنند.
- Workflow فقط‌خواندنی باشد و هیچ حذف واقعی انجام ندهد.
- نبود Evidence معتبر، صریحاً `KEEP_LEGACY` باقی بماند.
