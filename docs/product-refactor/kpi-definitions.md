# قرارداد شاخص‌های موفقیت پشتیبانی

وضعیت: قرارداد مصوب و نسخه‌دار — `KPI-V1`

تاریخ تثبیت: 2026-09-14

مرجع تصمیم: `D-018` از Baseline محصول `R0-v1` و دستور صریح مالک پروژه برای اجرای
فاز صفر KPI در Task جاری Codex

این سند قرارداد محاسباتی Reporting است. وجود فیلد یا Event به‌تنهایی به معنی پیاده‌سازی
شاخص نیست؛ هر شاخص فقط زمانی قابل انتشار است که Projection، کنترل کیفیت، Scope دسترسی و
تست تطبیق آن تکمیل شده باشد.

## ۱. قواعد مشترک اندازه‌گیری

- Timestampها در دیتابیس UTC ذخیره می‌شوند. مرز روز، هفته و ماه گزارش بر اساس
  `Asia/Tehran` تفسیر و سپس به بازه نیمه‌باز UTC یعنی `[from, to)` تبدیل می‌شود.
- هفته گزارش از شنبه ساعت ۰۰:۰۰ تا شنبه بعد و ماه بر اساس تقویم شمسی تعریف می‌شود؛ API
  بازه را با قرارداد شمسی `YYYY/MM/DD HH:mm:ss` و منطقه زمانی `Asia/Tehran` برمی‌گرداند.
  تبدیل این مقدار به UTC فقط در مرز Transport انجام می‌شود و محاسبات/ذخیره‌سازی داخلی UTC
  باقی می‌مانند.
- زمان مؤثر برابر است با `max(0, endedAt - startedAt - eligiblePauseDuration)`.
- فقط Pause وضعیت `WAITING_USER` از SLA کسر می‌شود. `WAITING_INTERNAL`، ارجاع، همکاری
  داخلی و نبود Owner ساعت SLA را متوقف نمی‌کنند.
- منبع بازسازی تاریخچه `TicketEvent` و Snapshot نسخه‌دار SLA/Taxonomy است؛ وضعیت فعلی
  Ticket به‌تنهایی منبع گزارش تاریخی نیست.
- Event تکراری با `eventId` یا Idempotency Key فقط یک بار در Projection اثر می‌گذارد.
- محاسبه در سرور و Reporting read model انجام می‌شود. مرورگر حق محاسبه KPI از فهرست کامل
  تیکت‌ها را ندارد.
- هر پاسخ گزارش باید `definitionVersion=KPI-V1`، `asOf`، بازه، Scope، شمار نمونه و وضعیت
  تازگی Projection را برگرداند.
- Duration در read model بر حسب میلی‌ثانیه صحیح ذخیره می‌شود. API علاوه بر شمار نمونه،
  `average`، `median` و `p90` را برمی‌گرداند.
- درصدها با دقت داخلی کامل محاسبه و در API تا دو رقم اعشار Round Half Up می‌شوند.
- مخرج صفر یا داده ناقص با `null` و دلیل machine-readable گزارش می‌شود؛ هرگز به صفر تبدیل
  نمی‌شود.

## ۲. جمعیت‌های خارج از KPI اصلی

موارد زیر از KPI اصلی حذف و در Data Quality یا Breakdown مستقل گزارش می‌شوند:

- تیکت `legacyImported` یا وضعیت `CLOSED_LEGACY`؛
- تیکت فاقد Event لازم، Route، Team، Queue، Request Type یا Snapshot معتبر SLA؛
- عملیات ناموفق یا Rollback‌شده که Event commit‌شده ندارد؛
- Event تکراری؛
- داده دمو/آزمایشی در Production، در صورت داشتن نشانگر رسمی داده آزمایشی؛
- Journey یا Business Reference تأییدنشده برای شاخص‌های حل خودکار و تراکنش.

حذف رکورد از مخرج باید با `exclusionReason` قابل شمارش باشد. Reporting اجازه ندارد برای
پرکردن داده ناقص Timestamp، Actor، Root Cause یا حجم تراکنش را حدس بزند.

## ۳. قرارداد KPIهای اصلی

### KPI-01 — زمان اولین پاسخ (First Response Time)

- جمعیت: تیکت‌های Native ایجادشده در بازه گزارش که Snapshot معتبر SLA دارند.
- نقطه شروع: `TicketSla.startedAt`.
- نقطه پایان: اولین پیام عمومی commit‌شده با `actorType=STAFF` و `sourceType=HUMAN`.
- فرمول: `firstHumanPublicResponseAt - slaStartedAt - WAITING_USER pauses before response`.
- Internal Note، پیام مشتری، اعلان سیستم، پاسخ خودکار و پیام پیشنهادشده‌ای که هنوز کارشناس
  ارسال نکرده است پاسخ اول انسانی محسوب نمی‌شوند.
- خروجی: `average`، `median`، `p90`، `respondedCount`، `pendingCount` و `excludedCount`.
- تیکت بدون پاسخ از Duration حذف نمی‌شود؛ در `pendingCount` یا پس از Due Date در نقض SLA
  پاسخ اول دیده می‌شود.

### KPI-02 — زمان حل کامل (Resolution Time)

- جمعیت: تیکت‌هایی که اولین Event معتبر `ticket.resolved.v1` آن‌ها در بازه رخ داده است.
- نقطه شروع: `TicketSla.startedAt`.
- نقطه پایان: اولین `resolvedAt` معتبر؛ Reopen مقدار اولین حل را بازنویسی نمی‌کند.
- فرمول: `firstResolvedAt - slaStartedAt - eligibleResolutionPauseDuration`.
- مدت کل چرخه تا آخرین Close به‌عنوان Breakdown ثانویه `totalLifecycleTime` گزارش می‌شود و
  جای Resolution Time را نمی‌گیرد.
- خروجی: `average`، `median`، `p90`، `resolvedCount` و `excludedCount`.

### KPI-03 — حل در اولین ارتباط (First Contact Resolution)

- جمعیت: تیکت‌های Native که اولین بار در بازه حل شده‌اند، پاسخ انسانی عمومی دارند و پنجره
  هفت‌روزه پس از Close آن‌ها کامل شده است.
- FCR موفق است اگر پیش از حل، پس از اولین پاسخ انسانی هیچ پیام عمومی دیگری از مشتری ثبت
  نشده باشد، هیچ Transfer یا Work Item/همکاری داخلی رخ نداده باشد و تا هفت روز تقویمی پس
  از Close هیچ Reopen یا رد نتیجه‌ای ثبت نشود.
- تعداد پیام‌های تکمیلی همان کارشناس پیش از پاسخ مجدد مشتری FCR را به‌تنهایی رد نمی‌کند؛
  مرز «ارتباط اول» اولین پاسخ انسانی تا اولین پاسخ بعدی مشتری است.
- حالت‌ها: `PENDING_WINDOW`، `ACHIEVED`، `NOT_ACHIEVED` و `EXCLUDED`.
- فرمول: `ACHIEVED / (ACHIEVED + NOT_ACHIEVED) * 100`.
- Journey حل خودکار، تیکت Legacy و تیکت بدون Event کامل وارد مخرج FCR انسانی نمی‌شوند.

### KPI-04 — رعایت زمان تعهد (SLA Compliance)

- رعایت پاسخ اول: Targetهایی که `firstResponseDueAt` آن‌ها در بازه است و وضعیت نهایی
  `MET` یا `BREACHED` دارند.
- رعایت حل: Targetهایی که `resolutionDueAt` آن‌ها در بازه است و وضعیت نهایی `MET` یا
  `BREACHED` دارند.
- فرمول هر Target: `MET / (MET + BREACHED) * 100`.
- رعایت ترکیبی: تیکت‌هایی با هر دو Target نهایی که هر دو `MET` باشند، تقسیم بر تمام
  تیکت‌های دارای هر دو Target نهایی در Cohort حل.
- `PENDING` در صورت/مخرج نهایی وارد نمی‌شود و جداگانه نمایش داده می‌شود؛ `NOT_APPLICABLE`
  و Legacy نیز Breakdown مستقل دارند.

### KPI-05 — بازشدن دوباره (Reopen Rate)

- جمعیت: تیکت‌های Native بسته‌شده در بازه که هفت روز تقویمی کامل از Close آن‌ها گذشته است.
- صورت: تعداد تیکت‌های یکتا با حداقل یک `ticket.reopened.v1` یا
  `ticket.resolution_rejected.v1` در هفت روز پس از Close.
- مخرج: تعداد کل تیکت‌های واجد شرایط بسته‌شده در همان Cohort.
- فرمول: `reopenedUniqueTickets / eligibleClosedTickets * 100`.
- چند Reopen برای یک تیکت در نرخ فقط یک‌بار شمرده می‌شود، اما `reopenEventCount` جداست.
- Breakdown منبع بازگشایی باید `CUSTOMER`، `STAFF` و `SYSTEM` را جدا نشان دهد.

### KPI-06 — رضایت کاربر (CSAT)

- Cohort: تیکت‌های Native بسته‌شده در بازه؛ Rating معتبر ثبت‌شده برای همان تیکت تا `asOf`.
- هر تیکت فقط یک Rating صحیح ۱ تا ۵ دارد.
- امتیاز: `sum(validRatings) / validRatingCount`.
- توزیع تعداد و درصد امتیازهای ۱ تا ۵ همراه میانگین نمایش داده می‌شود.
- نرخ مشارکت: `ratedEligibleTickets / eligibleClosedTickets * 100`.
- رتبه تیم فقط وقتی قابل انتشار است که حداقل ۳۰ Rating و نرخ مشارکت حداقل ۲۰٪ باشد؛ در غیر
  این صورت Score برابر `null` و دلیل `INSUFFICIENT_SAMPLE` است.
- Cohortهای کمتر از هفت روز از Close با برچسب `PROVISIONAL` نمایش داده می‌شوند، اما ثبت
  Rating دیرهنگام در دامنه Ticketing ممنوع نمی‌شود.

### KPI-07 — حل خودکار (Automated Resolution)

- جمعیت: Journeyهایی که در بازه شروع شده‌اند و حداقل یک محتوای
  `PUBLIC + APPROVED + ACTIVE` یا Rule مصوب به کاربر نمایش داده‌اند.
- حل خودکار فقط با تأیید صریح کاربر مبنی بر حل مسئله و بدون پیام/عمل انسانی و بدون ایجاد
  تیکت مرتبط طی ۲۴ ساعت پس از تأیید محاسبه می‌شود.
- فرمول: `confirmedAutomatedJourneys / eligibleKnowledgeJourneys * 100`.
- Journey بدون Feedback در صورت قرار نمی‌گیرد و در `unknownOutcomeCount` گزارش می‌شود.
- پاسخ آماده یا پیشنهاد AI که کارشناس آن را ارسال کرده، حل خودکار نیست. AI طبق `D-016`
  خارج از Launch است.

### KPI-08 — تیکت به ازای تراکنش (Ticket per Transaction)

- واحد استاندارد نمایش: تعداد تیکت به ازای هر ۱۰۰۰ تراکنش موفق.
- صورت: تیکت‌های یکتای ایجادشده در بازه با `TicketBusinessReference` تأییدشده و نوع مرجع
  سازگار با نوع تراکنش.
- مخرج: حجم تراکنش موفق همان نوع، سازمان/دامنه و همان بازه زمانی از Provider مرجع.
- فرمول: `verifiedUniqueTickets / successfulTransactionCount * 1000`.
- تیکت دارای چند Reference هم‌نوع در صورت فقط یک‌بار شمرده می‌شود.
- Reference تأییدنشده، تراکنش ناموفق و داده با بازه یا نوع ناسازگار حذف می‌شوند.
- نبود Provider یا مخرج صفر نتیجه `null` با دلیل `DENOMINATOR_UNAVAILABLE` است، نه صفر.

### KPI-09 — مشکلات پرتکرار (Recurring Problems)

- رتبه پایه بدون آستانه، تعداد و سهم تیکت‌های ایجادشده در بازه را بر اساس Service و Request
  Type نشان می‌دهد.
- گروه Root Cause فقط با `normalizedRootCauseId` یا `incidentId` مصوب ساخته می‌شود؛ متن آزاد
  مستقیماً Group نمی‌شود.
- یک گروه «پرتکرار» است اگر در پنجره لغزان هفت‌روزه حداقل ۵ تیکت از حداقل ۳ Party یکتا
  داشته باشد و تعداد آن حداقل دو برابر میانگین هفتگی چهار هفته قبل باشد.
- اگر سابقه ۲۸روزه کامل وجود نداشته باشد، گروه فقط `NEW_SIGNAL` است و افزایش درصدی برای آن
  منتشر نمی‌شود.
- نرخ مشکل پرتکرار: `ticketsInRecurringGroups / eligibleTicketsWithNormalizedCause * 100`.
- خروجی شامل Count، سهم، تغییر نسبت به Baseline و Drill-down کنترل‌شده است.

## ۴. شاخص عملیاتی ثانویه

`Backlog Age` KPI اصلی بخش ۱۵ نیست، اما برای عملیات نگه داشته می‌شود:

- جمعیت: تیکت‌های حل‌نشده در `asOf`؛
- فرمول: `asOf - queueEnteredAt`؛
- Bucketها: کمتر از ۴ ساعت، ۴ تا ۲۴ ساعت، ۱ تا ۳ روز، ۳ تا ۷ روز و بیشتر از ۷ روز؛
- `WAITING_USER` جدا نمایش داده می‌شود و با Backlog فعال تیم مخلوط نمی‌شود.

## ۵. ابعاد و Snapshot تاریخی

- Service و Request Type با شناسه و نسخه زمان ایجاد؛
- Team، Queue و Owner با Snapshot زمان Event مرتبط؛
- Priority زمان ایجاد و Priority زمان حل؛
- Party Type به‌صورت `INDIVIDUAL` یا `ORGANIZATION` بدون هویت؛
- Company/SLA Plan در صورت وجود Snapshot مجاز؛
- Channel؛
- Incident و Root Cause استاندارد؛
- زمان و تقویم کاری.

تغییر نام، Route یا Taxonomy نباید گزارش گذشته را بازنویسی کند. Breakdown با Dimension
ناشناخته در Bucket `UNKNOWN` قرار می‌گیرد و Data Quality آن را نشان می‌دهد.

## ۶. قرارداد دسترسی و طبقه‌بندی

Permissionهای هدف فاز API:

| Permission | Scope | نقش پیش‌فرض هدف |
| --- | --- | --- |
| `reporting.kpi.read.team` | تیم‌های صریح UserRoleAssignment | `SUPERVISOR` |
| `reporting.kpi.read.global` | تمام تیم‌های پشتیبانی | `SUPPORT_MANAGER` |
| `reporting.kpi.audit.read` | Aggregate ماسک‌شده، بدون Drill-down | `AUDITOR` |
| `reporting.kpi.export` | علاوه بر read و در همان Scope | فقط Grant صریح |

- `SUPPORT_AGENT`، مشتری فردی، نماینده و مدیر شرکت به داشبورد مدیریتی داخلی دسترسی ندارند.
- `SYSTEM_ADMINISTRATOR` فقط به دلیل نقش فنی، دسترسی پیش‌فرض KPI یا Drill-down ندارد؛ Grant
  صریح یا Break-glass ممیزی‌شده لازم است.
- Drill-down همیشه مجوز عادی مشاهده Ticket را دوباره بررسی می‌کند و از Permission گزارش
  نتیجه نمی‌شود.
- Aggregateها `INTERNAL` هستند. متن Ticket/Message، موبایل، کدملی، نام فایل و شناسه مالی در
  Fact، Log، Metric یا Export گزارش قرار نمی‌گیرند.
- Breakdown سازمانی با کمتر از ۵ تیکت در خروجی عمومی مدیریتی Suppress می‌شود تا امکان
  شناسایی فرد کاهش یابد.
- Export بدون `reporting.kpi.export` ممنوع و هر Export دارای Audit است.

این Permissionها در `KPI-V1` قرارداد هدف هستند و تا فاز API نباید به‌عنوان قابلیت اجرایی
اعلام شوند.

## ۷. کنترل کیفیت و وضعیت انتشار

هر پاسخ Reporting این شمارنده‌ها را ارائه می‌کند:

- `eligibleCount`
- `excludedCount`
- `missingEventCount`
- `missingDimensionCount`
- `legacyCount`
- `projectionLagSeconds`
- `lastProjectedEventAt`

قواعد انتشار:

- اختلاف Aggregate با Query مرجع باید صفر باشد؛ اختلاف غیرصفر Alert و مانع انتشار است.
- Projection Lag بیشتر از ۵ دقیقه با `STALE` و بیشتر از ۱۵ دقیقه با `UNAVAILABLE` گزارش
  می‌شود.
- KPI با Data Quality بحرانی، مخرج ناموجود یا نمونه ناکافی مقدار جعلی منتشر نمی‌کند.
- Legacy، Native، Automated و Human در گزارش مخلوط نمی‌شوند.
- تغییر فرمول نیازمند نسخه جدید، تاریخ اثر و Backfill/Rebuild مستقل است؛ `KPI-V1` درجا تغییر
  معنی نمی‌دهد.

## ۸. مثال‌های پذیرش KPI-V1

| KPI | ورودی نمونه | خروجی مورد انتظار |
| --- | --- | --- |
| زمان پاسخ | شروع 08:00، Pause معتبر ۱۰ دقیقه، پاسخ انسانی 08:40 | ۳۰ دقیقه |
| زمان حل | شروع 08:00، Pause معتبر ۶۰ دقیقه، حل 11:00 | ۱۲۰ دقیقه |
| FCR | پاسخ انسانی، حل، بدون پاسخ مجدد/ارجاع و بدون Reopen تا ۷ روز | `ACHIEVED` |
| رعایت SLA | ۸۰ Target برابر `MET` و ۲۰ Target برابر `BREACHED` | ۸۰٪ |
| بازگشایی | ۸ تیکت یکتا از ۱۰۰ تیکت Matured دوباره باز شده‌اند | ۸٪ |
| CSAT | امتیازهای ۵، ۴ و ۳ | میانگین ۴؛ به‌علت نمونه کمتر از ۳۰ منتشر نشود |
| حل خودکار | ۳۰ تأیید معتبر بدون تیکت از ۱۰۰ Journey واجد شرایط | ۳۰٪ |
| تیکت/تراکنش | ۲۰ تیکت یکتا از ۱۰٬۰۰۰ تراکنش موفق | ۲ تیکت در هزار |
| پرتکرار | ۱۲ تیکت/۴ Party در ۷ روز و Baseline هفتگی ۴ | سیگنال پرتکرار با رشد ۲۰۰٪ |

## ۹. Definition of Done قرارداد

- هر ۹ KPI دارای نام، Cohort، صورت، مخرج، استثنا، نسخه و مثال پذیرش است.
- قواعد Timezone، Pause، Reopen، FCR، CSAT و داده ناموجود بسته شده‌اند.
- نقش و Scope گزارش و Export مشخص است.
- داده حساس و سیاست Suppression مشخص است.
- وابستگی خارجی حل خودکار و حجم تراکنش صریح است و با داده ساختگی جایگزین نمی‌شود.
- تغییر بعدی فقط با Decision نسخه‌دار و تحلیل اثر روی Schema/API/Migration/Test مجاز است.
