# فاز R9 — تکمیل چرخه عمر تیکت

وضعیت: پیاده‌سازی کامل؛ اجرای دوره‌ای Job در Production باید توسط Scheduler زیرساخت فعال شود

## دامنه تحویل

- Resolution Cycle تاریخچه‌دار برای هر بار `RESOLVED`
- دو یادآوری در روز کاری اول و دوم
- بستن خودکار پس از سه روز کاری در نبود پاسخ مشتری
- تأیید نتیجه به `CLOSED` و رد نتیجه به `REOPENED`
- بازگشایی `CLOSED` فقط تا هفت روز تقویمی
- تکمیل یا لغو Work Item داخلی و بازگرداندن Aggregate به `IN_PROGRESS` پس از پایان آخرین همکاری
- دسترسی تیم همکار به Ticket فقط در مدت Work Item باز و فقط برای Internal Note/تکمیل کار

## مدل داده

Migration افزایشی `20260914100000_ticket_resolution_cycles` جدول `TicketResolutionCycle` را ایجاد می‌کند. هر Cycle دارای sequence، زمان پیشنهاد نتیجه، دو موعد یادآوری، موعد Auto-close، شمارنده یادآوری، outcome و active key یکتا است. Outcomeهای ممکن:

- `PENDING`
- `CONFIRMED`
- `REJECTED`
- `AUTO_CLOSED`

این مدل تاریخچه Resolveهای مکرر را حفظ می‌کند و مانع دو Cycle فعال هم‌زمان برای یک Ticket می‌شود. Schema قدیم حذف یا تغییر معنایی ندارد.

## زمان‌بندی روز کاری

محاسبه بر اساس `SlaCalendar` نسخه‌دار Ticket انجام می‌شود؛ تعطیلات، روزهای فاقد بازه کاری و timezone تقویم لحاظ می‌شوند. برای Ticketهایی که Policy تقویمی دارند، تقویم کسب‌وکار فعال به‌عنوان تقویم Lifecycle استفاده می‌شود. ترتیب موعدها همیشه:

`proposedAt < reminderOneAt < reminderTwoAt < autoCloseAt`

Worker در صورت تأخیر Scheduler، یادآوری‌های ثبت‌نشده را قبل از Auto-close ایجاد می‌کند؛ بنابراین شرط «دو یادآوری» دور زده نمی‌شود.

## API و Job

| Method | Route | کاربرد |
| --- | --- | --- |
| POST | `/api/v2/workspace/tickets/{ticketId}/work-items/{workItemId}/complete` | ثبت نتیجه و تکمیل همکاری |
| POST | `/api/v2/workspace/tickets/{ticketId}/work-items/{workItemId}/cancel` | لغو همکاری با دلیل |
| POST | `/api/internal/tickets/lifecycle/process` | backfill امن Cycle، یادآوری و Auto-close |

Commandهای Work Item همان کنترل‌های Idempotency، `If-Match`، RBAC، version و Audit فاز R8 را دارند. Job داخلی با maintenance token، source/operation rate limit و Audit محافظت می‌شود.

## رفتار Transition

- `RESOLVED → CLOSED`: تأیید مشتری یا Timeout Worker
- `RESOLVED → REOPENED`: رد نتیجه همراه دلیل
- `CLOSED → REOPENED`: فقط در هفت روز پس از `closedAt`
- `REOPENED → IN_PROGRESS`: نخستین اقدام/پاسخ عمومی کارشناس
- `INTERNAL_REFERRAL|WAITING_INTERNAL → IN_PROGRESS`: پس از بسته‌شدن آخرین Work Item باز

تأیید، رد یا Auto-close، Cycle فعال را با outcome متناظر نهایی می‌کند. Resolve بعدی Cycle جدید با sequence بعدی می‌سازد و تاریخچه قبلی را بازنویسی نمی‌کند.

## حریم دسترسی همکاری داخلی

- Team اصلی همچنان Owner پاسخ عمومی، انتقال، Priority و Resolve است.
- Team همکار در مدت Work Item باز می‌تواند Ticket را ببیند، Internal Note ثبت و Work Item مجاز را تکمیل کند.
- داشتن Work Item اجازه پاسخ عمومی، انتقال، تغییر Owner/Priority یا Resolve نمی‌دهد.
- با تکمیل/لغو آخرین Work Item، Scope موقت Team همکار حذف می‌شود.

## Rollout

1. migration افزایشی پیش از deploy اجرا شود.
2. Agent Workspace همچنان پشت `FEATURE_AGENT_WORKSPACE_V2_ENABLED` می‌ماند.
3. Scheduler با همان secret امن maintenance، endpoint Lifecycle را با تناوب حداکثر یک ساعت فراخوانی کند.
4. در Pilot، تعداد Cycle فعال، reminder، auto-close، reopen و اختلاف Event بررسی شود.
5. هر Auto-close بدون دو reminder، Cycle فعال تکراری، عبور از پنجره هفت‌روزه یا دسترسی Team همکار به عملیات Owner معیار No-Go است.

## شواهد

- Unit: تقویم روز کاری/تعطیلات، قرارداد Work Item و headerهای concurrency
- Runtime: تکمیل Work Item، ساخت schedule، دو reminder، Auto-close، Reopen، Reject، Confirm، سه outcome تاریخچه و رد Reopen منقضی
- فرمان: `npm run test:r9-runtime`
