# فاز KPI-5 — FCR، بازگشایی و CSAT

وضعیت: Completed

تاریخ اجرا: 2026-09-15

نسخه قرارداد: `KPI-V1`

Migration: `20260915120000_reporting_fcr_reopen_csat`

## هدف

انتشار سه شاخص کیفیت پشتیبانی از read model قابل‌بازسازی: حل در اولین ارتباط، نرخ
بازگشایی هفت‌روزه و رضایت مشتری. محاسبات از Ticket جاری یا لیست Browser انجام نمی‌شوند و
در نبود Freshness، اعتبار داده یا حداقل نمونه، عدد ظاهراً معتبر منتشر نمی‌شود.

## قرارداد API

`GET /api/v2/reporting/kpis/quality?from={ISO-8601}&to={ISO-8601}`

- مرز بازه `[from, to)` و حداکثر طول آن ۳۶۶ روز است.
- پاسخ شامل `definitionVersion`، `asOf`، `Asia/Tehran`، Scope، Freshness، Data Quality و
  شمار کامل cohortها است.
- Cache برابر `private, no-store` و Rate Limit همان سیاست ۳۰ Query در دقیقه گزارش‌ها است.
- همان Permissionها و Scope صریح فاز KPI-4 اعمال می‌شوند؛ مدیر سیستم صرف دسترسی ضمنی ندارد.

## FCR

Cohort بر اساس `firstResolvedAt` ساخته می‌شود. نمونه فقط پس از اولین Close و تکمیل پنجره
هفت‌روزه وارد مخرج می‌شود. شرط موفقیت این است که بعد از اولین پاسخ عمومی انسانی کارشناس:

- پیام عمومی دیگری از مشتری ثبت نشده باشد؛
- انتقال تیم/صف یا همکاری و Work Item ثبت نشده باشد؛
- رد نتیجه یا بازگشایی داخل پنجره هفت‌روزه رخ نداده باشد.

پیام اضافی کارشناس به‌تنهایی FCR را رد نمی‌کند. خروجی `achievedCount`،
`notAchievedCount`، `pendingCloseCount`، `pendingWindowCount` و `excludedCount` را جدا
می‌کند. درصد برابر `ACHIEVED / (ACHIEVED + NOT_ACHIEVED) * 100` است.

## بازگشایی

Cohort با `firstClosedAt` ثابت می‌شود؛ Close بعدی آن را جابه‌جا نمی‌کند. فقط cohortهایی که
پنجره هفت‌روزه‌شان کامل شده در مخرج قرار می‌گیرند. هر تیکت در صورت یک یا چند بازگشایی فقط
یک‌بار در صورت کسر شمرده می‌شود، ولی `reopenEventCount` تعداد رخدادها را حفظ می‌کند.

منبع رخداد به سه گروه `customer`، `staff` و `system` تفکیک و برای هرکدام تعداد تیکت یکتا
و تعداد Event برگردانده می‌شود. قید دیتابیس جمع شمارنده‌های منبع را با شمار کل رخدادها برابر
نگه می‌دارد؛ ناسازگاری Projection سبب `CRITICAL_DATA_QUALITY` و مقدار `null` می‌شود.

## CSAT

Cohort بر اساس اولین Close در بازه است و رأی صحیح همان تیکت تا `asOf`، عدد صحیح ۱ تا ۵
است. رأی دیرهنگام حذف نمی‌شود. تیکت‌های بسته‌شده‌ای که هنوز هفت روز از آن‌ها نگذشته با
`provisionalClosedCount` مشخص می‌شوند.

امتیاز و توزیع فقط زمانی منتشر می‌شوند که هم‌زمان حداقل ۳۰ رأی و حداقل ۲۰٪ مشارکت وجود
داشته باشد. در غیر این صورت `score=null`، `distribution=null` و
`reason=INSUFFICIENT_SAMPLE` است؛ درصد مشارکت برای تشخیص علت همچنان نمایش داده می‌شود.
میانگین و درصدها با محاسبات صحیح و Round Half Up تا دو رقم اعشار محاسبه می‌شوند.

## Data model و Projection

- `firstClosedAt` لنگر immutable cohort است و `lastClosedAt` صرفاً آخرین Close را نگه می‌دارد.
- شمار `resolutionRejectionCount` برای ارزیابی FCR مستقل از بازگشایی بعدی حفظ می‌شود.
- شمار بازگشایی داخل پنجره و شمار منبع مشتری/کارشناس/سیستم روی Fact نگه داشته می‌شود.
- migration صرفاً additive است و Ticket، User یا Event عملیاتی را تغییر نمی‌دهد.
- پس از migration، Factها و processed-eventهای گزارش‌گیری از Outbox کامل rebuild می‌شوند.

## Freshness، Rollout و Rollback

قواعد Freshness مشترک با KPI-4 است: بالای ۵ دقیقه `STALE`، بالای ۱۵ دقیقه یا وضعیت
`FAILED/REBUILDING/UNAVAILABLE` برابر `UNAVAILABLE`. در حالت unavailable همه مقدارهای KPI
`null` هستند. Rollback کاربردی با `FEATURE_REPORTING_API_ENABLED=false` انجام می‌شود؛
ستون‌ها و indexهای migration برای rollback اضطراری بی‌خطر باقی می‌مانند.

## پذیرش

- تیکت بازشده با چند Event فقط یک‌بار در نرخ و چندبار در Event count دیده می‌شود.
- رخداد پس از روز هفتم روی cohort بازگشایی اثر ندارد.
- منبع هر رخداد دقیقاً یکی از مشتری، کارشناس یا سیستم است.
- نمونه FCR قبل از Close و قبل از تکمیل پنجره وارد مخرج نمی‌شود.
- CSAT با ۲۹ رأی یا مشارکت کمتر از ۲۰٪ منتشر نمی‌شود؛ با ۳۰ رأی و مشارکت کافی منتشر می‌شود.
- رأی دیرهنگام معتبر و cohort کمتر از هفت روز provisional است.
- Projection ناسازگار، مخرج صفر و Freshness نامعتبر هرکدام دلیل صریح و مقدار `null` دارند.

## نتیجه اجرای محلی

| کنترل | نتیجه |
| --- | --- |
| Migration | PASS؛ هر ۳۱ migration اعمال شده و schema همگام است |
| Projection rebuild | PASS؛ ۵۹ رخداد Outbox، ۵۹ رخداد پردازش‌شده، checkpoint برابر `HEALTHY` و failure صفر |
| تست‌های هدف | PASS؛ ۴۰ تست محاسبات، projector، API و schema |
| تست یکپارچه MySQL | PASS؛ rebuild کامل و Query مجاز واقعی |
| رگرسیون کامل Jest | PASS؛ ۸۸ Suite و ۴۶۹ Test، سه integration opt-in در اجرای عادی skip |
| TypeScript و ESLint | PASS |
| Prisma validate و release contract | PASS |
| Production build | PASS؛ Next.js 16.3.4 / Turbopack و Route جدید ثبت‌شده |
| Runtime مرورگر و Next MCP | PASS؛ احراز هویت اجباری، compile issue صفر، config/session error صفر |

۱۳ Fact فعلی همگی از داده تاریخی بازسازی شده‌اند و مطابق سیاست Data Quality وارد KPI Native
نمی‌شوند. بنابراین صفر یا `null` فعلی به معنی نبود نمونه واجد شرایط است، نه خطای محاسبه؛
تیکت‌های Native جدید به‌صورت خودکار وارد cohortهای این فاز خواهند شد.
