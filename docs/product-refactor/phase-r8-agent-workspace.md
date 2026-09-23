# فاز R8 — فضای کاری کارشناس و سرپرست

وضعیت: پیاده‌سازی کامل؛ rollout تولید منوط به Pilot کنترل‌شده

## دامنه تحویل

- داشبورد صف‌های مجاز، شمارنده تیکت فعال و هشدار SLA
- فهرست Cursor-based با فیلتر صف، وضعیت، اولویت و مالکیت
- Workspace DTO مستقل شامل پیام عمومی و داخلی، تاریخچه تخصیص، SLA و Work Item
- تخصیص/لغو مالک، انتقال Team/Queue، پاسخ عمومی، یادداشت داخلی، درخواست اطلاعات مشتری، حل تیکت، تغییر اولویت و همکاری داخلی
- حفظ مالک اصلی و SLA snapshot در همکاری یا انتقال
- نگه‌داشتن UI قدیمی پشت `FEATURE_AGENT_WORKSPACE_V2_ENABLED`

## مدل داده و Migration

Migration افزایشی `20260913150000_agent_workspace_work_items` جدول `TicketWorkItem` را با وضعیت‌های `OPEN`، `COMPLETED` و `CANCELLED` می‌سازد. هیچ جدول یا ستون legacy حذف یا rename نشده است. کلیدهای خارجی Team، Queue، Assignee و Requester، و indexهای جست‌وجوی تیکت/صف/مالک افزوده شده‌اند. حذف Ticket به‌صورت cascade فقط Work Item همان Aggregate را حذف می‌کند؛ حذف موجودیت‌های سازمانی و کاربر Restrict است.

## قراردادهای HTTP

| Method | Route | کنترل اصلی |
| --- | --- | --- |
| GET | `/api/v2/workspace/tickets` | RBAC تیمی + cursor امضاشده |
| GET | `/api/v2/workspace/tickets/{ticketId}` | concealment خارج Scope + ETag |
| POST | `.../assign` | عضویت فعال مالک در Team |
| POST | `.../transfer` | صف فعال، تاریخچه Assignment، SLA بدون reset |
| POST | `.../public-replies` | Public message + first-response SLA + اعلان مشتری |
| POST | `.../internal-notes` | فقط INTERNAL؛ بدون اعلان یا DTO مشتری |
| POST | `.../request-customer-input` | transition معتبر به `WAITING_USER` + pause SLA |
| POST | `.../resolve` | transition معتبر + root cause الزامی بر اساس RequestType |
| POST | `.../priority-change` | دلیل الزامی + حفظ snapshot فعلی SLA |
| POST | `.../collaborators` | Work Item مستقل + حفظ Primary Owner |

همه Commandها به `Idempotency-Key` و `If-Match` نیاز دارند، در transaction با isolation سطح Serializable اجرا می‌شوند، نسخه Aggregate را اتمیک افزایش می‌دهند و Audit/Event/Outbox تولید می‌کنند.

## کنترل دسترسی و محرمانگی

- ورود به Workspace علاوه بر authentication به `support.workspace.access` و `ticket.workspace.read` نیاز دارد.
- عملیات بر اساس permission مستقل و Scope تیم جاری کنترل می‌شود.
- نبود دسترسی مانند نبود منبع پاسخ داده می‌شود تا شناسه تیکت/صف افشا نشود.
- مالک انتخابی باید Role Assignment فعال در Team داشته باشد.
- Customer API همچنان فقط `PUBLIC` messageها را select می‌کند؛ تست runtime عدم نشت Internal Note را اثبات می‌کند.
- DTO ورودی strict است و `visibility`، `actorUserId`، `ownerUserId` ناخواسته یا سایر فیلدهای mass-assignment را نمی‌پذیرد.

## رابط کاربری

- `/admin/workspace`: داشبورد عملیاتی جدید
- `/admin/tickets`: فهرست جدید در حالت Flag روشن و فهرست legacy در حالت خاموش
- `/admin/tickets/{ticketId}`: Workspace کامل در حالت Flag روشن و جزئیات legacy در حالت خاموش
- Sidebar دسکتاپ و موبایل فقط در حالت فعال بودن Flag، لینک Workspace را نمایش می‌دهند.

## Rollout و Rollback

1. migration افزایشی پیش از application deploy اجرا شود.
2. Flag در Production پیش‌فرض `false` باقی بماند.
3. ابتدا برای محیط staging و سپس Pilot داخلی فعال شود.
4. خطای authorization، نشت INTERNAL، گم‌شدن Owner، تغییر Deadline SLA یا اختلاف count معیار فوری No-Go است.
5. rollback اپلیکیشن فقط با خاموش‌کردن Flag انجام می‌شود؛ Schema افزوده‌شده باقی می‌ماند و با نسخه قبلی سازگار است.

## شواهد و گیت‌ها

- Unit: strict schema، bounded pagination، headerهای idempotency/concurrency و error contract
- Runtime: create مشتری، scope Workspace، Internal Note isolation، assign، priority، collaboration، public reply، WAITING_USER، customer reply، resolve و idempotent replay
- Release: Prisma validate/migrate، lint، typecheck، test، production build و release-readiness

فرمان runtime: `npm run test:r8-runtime` در حالی که `next dev` روی پورت ۳۰۰۰ فعال است.
