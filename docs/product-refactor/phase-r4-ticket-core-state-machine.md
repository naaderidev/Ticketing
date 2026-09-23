# فاز R4 — Ticket Core و State Machine

وضعیت: تکمیل و تأییدشده — Baseline `R4-v1`

تاریخ: 2026-09-13

پیش‌نیاز: Baseline کاتالوگ و صف `R3-v1`

## هدف و مرز فاز

R4، Ticket قدیمی را بدون حذف یا تغییر معنای ستون‌های قبلی به Aggregate هدف متصل می‌کند.
مالک کسب‌وکاری Ticket اکنون `Party` است و `User` فقط Actor ثبت‌کننده یا انجام‌دهنده Command
است. Request Type، Route version، Team، Queue و Priority در سرور تعیین می‌شوند. UI جدید
کاربر و Workspace، محاسبه SLA، Providerهای Business Subject و مصرف Outbox خارج از مرز R4
هستند و در فازهای بعدی فعال می‌شوند.

## مدل داده افزایشی

ستون‌های زیر به `Ticket` اضافه شدند و برای rollback نسخه Application nullable باقی ماندند:

- `lifecycleStatus`، `priority`، `version` و `routeVersion`
- `createdById`، `partyId` و `organizationId`
- `requestTypeId`، `supportTeamId`، `queueId` و `ownerUserId`
- `legacyImported`، `rootCause` و `resolutionSummary`

Aggregate جدید شامل این مدل‌ها است:

- `TicketMessage`: پیام عمومی/داخلی با Actor، Party، snapshot نویسنده و منبع legacy
- `TicketEvent`: رخداد immutable چرخه‌عمر و عملیات Ticket
- `TicketAssignment`: تاریخچه Team/Queue/Owner با دقیقاً یک رکورد فعال
- `TicketBusinessReference`: مرجع کسب‌وکاری verified و scopeپذیر
- `TicketCommandReceipt`: نتیجه Command برای retry امن و جلوگیری از اجرای تکراری
- `OutboxEvent`: envelope مستقل و تراکنشی برای consumerهای SLA/Notification/Reporting

فایل خصوصی اکنون `messageId` دارد و در dual-run می‌تواند هم‌زمان relation قدیمی Ticket/Reply
و relation canonical Message را حفظ کند. Department و SubDepartment داخلی intake با
`internalOnly` از API و UI legacy مخفی هستند و فقط برای سازگاری ستون‌های اجباری قدیمی
استفاده می‌شوند.

## State Machine و invariantها

وضعیت‌های canonical:

`NEW`، `UNASSIGNED`، `IN_PROGRESS`، `INTERNAL_REFERRAL`، `WAITING_INTERNAL`،
`WAITING_USER`، `RESOLVED`، `CLOSED`، `REOPENED` و `CLOSED_LEGACY`.

- Team و Queue در تمام Ticketهای ساخته‌شده توسط Application الزامی‌اند.
- Ticketهای native بدون Owner فقط در `UNASSIGNED` پایدار می‌شوند؛ `NEW` وضعیت گذرای پیش از
  route است. داده legacy تا زمان تعیین Owner می‌تواند وضعیت تاریخی خود را حفظ کند.
- مشتری فقط Transitionهای مصوب را انجام می‌دهد: `RESOLVED → CLOSED`،
  `RESOLVED → REOPENED` و `CLOSED → REOPENED` در پنجره هفت‌روزه.
- `CLOSED_LEGACY` برای داده‌ای است که سابقه قابل اثبات RESOLVED ندارد و از API v2 بازگشایی
  نمی‌شود؛ بدین ترتیب تاریخچه حل جعل نشده است.
- Reply کاربر از `WAITING_USER` به `IN_PROGRESS` برمی‌گردد؛ اگر Owner قابل اثبات نباشد به
  `UNASSIGNED` می‌رود.
- هر mutation موفق `version` را افزایش می‌دهد و Commandهای حساس `If-Match` می‌خواهند.

## APIهای Customer v2

| Method | Path | رفتار |
| --- | --- | --- |
| POST | `/api/v2/tickets` | ثبت اتمیک Ticket، route، assignment، اولین message، event، outbox، فایل و اعلان |
| GET | `/api/v2/tickets` | فهرست Party جاری با cursor امضاشده |
| GET | `/api/v2/tickets/{ticketId}` | Customer DTO بدون Team/Queue/Internal Note |
| GET | `/api/v2/tickets/{ticketId}/timeline` | Timeline عمومی صفحه‌بندی‌شده با cursor امضاشده |
| POST | `/api/v2/tickets/{ticketId}/messages` | پیام عمومی، dual-write Reply، claim فایل و اثر state |
| POST | `/api/v2/tickets/{ticketId}/confirm-resolution` | تأیید نتیجه و Close معتبر |
| POST | `/api/v2/tickets/{ticketId}/reject-resolution` | رد نتیجه و Reopen همراه دلیل |
| POST | `/api/v2/tickets/{ticketId}/reopen` | بازگشایی Closed تا هفت روز همراه دلیل |
| POST | `/api/v2/tickets/{ticketId}/rating` | امتیاز یک‌باره پس از Close canonical |

تمام Commandها ورودی strict، `Idempotency-Key`، scope Party/Organization، CSRF، rate limit،
Audit و response envelope v2 دارند. عملیات حساس علاوه بر آن ETag از شکل
`W/"ticket-<publicId>-v<version>"` را با `If-Match` مقایسه می‌کنند. نبود precondition برابر
428، نسخه قدیمی یا اجرای هم‌زمان برابر 409 و cursor دست‌کاری‌شده برابر 422 است.

Request Typeهایی که Business Subject آن‌ها از Contract/Finance/Meter یا Provider خارجی
می‌آید، تا پیاده‌سازی Adapter معتبر با 503 fail-closed می‌شوند. `ORGANIZATION_MEMBERSHIP`
از Context سروری و `RELATED_TICKET` از داده محلی scopeشده اعتبارسنجی می‌شود.

## Dual-write و سازگاری legacy

مسیرهای فعلی create، reply، transfer/status و rating همچنان پاسخ قبلی را برمی‌گردانند، اما
در همان serializable transaction این داده‌ها را نیز ثبت می‌کنند:

- Party/RequestType/Team/Queue/route version و lifecycle روی Ticket
- TicketMessage و relation فایل canonical
- TicketAssignment و تاریخچه انتقال/Owner
- TicketEvent به‌همراه OutboxEvent از helper واحد
- افزایش version و Actor واقعی مشتق‌شده از session

Mapping Department/SubDepartment فقط وقتی استفاده می‌شود که بازبین آن را `MAPPED` کرده
باشد. در غیر این صورت Ticket به `LEGACY_REVIEW_INBOX` می‌رود. هیچ تطبیق نامی یا حدس Team
انجام نمی‌شود. بستن از UI قدیمی به‌صورت `CLOSED_LEGACY` ثبت می‌شود تا rollout رابط جدید
عملیات جاری را متوقف نکند و در عین حال RESOLVED جعلی ساخته نشود.

حذف عملیاتی Ticket از API قدیمی با پاسخ 409 و Audit مسدود شده است؛ حذف فیزیکی فقط باید از
مسیر retention مصوب انجام شود. Job نگه‌داری، Ticketهای قرنطینه‌ای را نیز به‌صورت batch محدود
بازبینی می‌کند و تنها پس از `MAPPED` شدن صریح SubDepartment و وجود دقیقاً یک Route فعال،
RequestType/Team/Queue را همراه Assignment و Event/Outbox اتمیک به‌روزرسانی می‌کند.

## Migration و Backfill

Migrationهای R4:

1. `20260913120000_ticket_core_state_machine`
2. `20260913121000_ticket_message_attachment_link`
3. `20260913121000_ticket_message_attachments`
4. `20260913122000_ticket_transactional_outbox`
5. `20260913123000_backfill_legacy_routing_events`

همه تغییرها Expand هستند. Drop، rename یا تبدیل مخرب وجود ندارد. Migration اول داده قدیمی
را به‌صورت set-based backfill می‌کند؛ Migration دوم relation فایل را اضافه می‌کند؛ Migration
سوم backfill relation فایل است؛ Migration چهارم Outbox و envelope تمام Eventهای موجود را
می‌سازد؛ Migration پنجم رخداد route قابل استناد را برای Ticketهای legacy اضافه می‌کند.
Schema توسعه‌یافته با binary قبلی سازگار باقی می‌ماند.

Reconciliation دیتابیس محلی پس از migration و smoke test:

| کنترل | نتیجه |
| --- | ---: |
| Ticket | 61 |
| TicketMessage | 83 = 61 پیام اولیه + 22 Reply |
| Assignment فعال | 61 |
| TicketEvent | 122 = 61 ایجاد + 61 route |
| OutboxEvent متناظر | 122 |
| Ticket فاقد فیلد canonical اصلی | 0 |
| Ticket با تعداد Assignment فعال غیر از یک | 0 |
| Outbox بدون TicketEvent | 0 |
| Attachment فاقد Message canonical | 0 از 12 |
| Ticket قرنطینه‌شده به‌علت نبود mapping تأییدشده | 61 |
| CLOSED_LEGACY | 16 |
| کاربر آزمایشی باقی‌مانده | 0 |

هر 122 Outbox در وضعیت unpublished باقی مانده‌اند؛ این وضعیت عمدی است و consumer/retry/DLQ
در فاز وابسته پیاده می‌شود. اعلان داخل برنامه همچنان داخل همان transaction ذخیره می‌شود.

## Feature Flag، rollout و rollback

- `FEATURE_SUPPORT_V2_READ_ENABLED`: خواندن Catalog/Ticket v2
- `FEATURE_SUPPORT_V2_WRITE_ENABLED`: Commandهای Ticket v2
- `FEATURE_AGENT_WORKSPACE_V2_ENABLED`: Workspace جدید
- `FEATURE_ORGANIZATION_CONTEXT_ENABLED`: Context سازمانی

همه Flagها در Production بدون مقدار صریح fail-closed هستند. ترتیب rollout: migration،
reconciliation، staging، read canary، write canary و سپس cohort محدود. Rollback عملیاتی با
خاموش‌کردن write/read v2 و بازگرداندن Application انجام می‌شود؛ migration معکوس و Drop فوری
مجاز نیست و در صورت ایراد Schema فقط forward-fix اجرا می‌شود.

No-Goهای R4:

- هر Ticket فعال بدون Party/Team/Queue/RequestType یا بدون یک Assignment فعال
- اختلاف شمارش Message/Attachment/Event/Outbox
- مشاهده Ticket از Party دیگر یا افشای Internal Note/Team/Queue در Customer DTO
- اجرای دوباره Command با یک Idempotency Key
- پذیرش mutation بدون If-Match یا با version قدیمی
- فعال‌سازی Provider-dependent Request Type بدون Adapter معتبر

## شواهد کیفیت

- Prisma schema validation و وضعیت 17 migration: پاس و up to date
- TypeScript: پاس
- ESLint با صفر warning: پاس
- Jest: 55 suite و 326 test پاس؛ threshold ماژول‌های امنیتی critical نیز پاس
- Release contract، migration integrity و staging rehearsal: پاس
- Production build روی Next.js 16.3.4/Turbopack: پاس؛ تمام routeهای R4 ساخته شدند
- Next.js MCP compilation issues: صفر؛ browser/config runtime errors: صفر
- Runtime smoke: create=201، replay=200، missing If-Match=428، message=200،
  message replay=200، reused key=409، stale version=409، confirm/replay=200، rating=200،
  reopen=200، reject-resolution=200، cross-Party read=404، list/timeline=200 و cursor
  دست‌کاری‌شده=422
- Smoke test دو User و یک Ticket موقت را در پایان حذف کرد و count پایه دوباره 61 شد.
- `npm run verify:r4-data`: تمام اختلاف‌های Message/Event/Outbox، شناسه نامعتبر، core ناقص،
  assignment تکراری، relation فایل ناقص و داده آزمایشی برابر صفر.

## معیار خروج و کار باقی‌مانده

هسته Ticket، State Machine، scope، concurrency، idempotency، dual-write و Outbox آماده‌اند.
پیش از Production cutover باید 61 mapping قرنطینه بررسی شوند. R5 باید SLA snapshot و Clock،
Routing policy اجرایی، pause/resume/escalation و consumer ایمن Outbox را اضافه کند. Integration
Providerها، Customer UI جدید، Workspace کامل و lifecycle automation نیز طبق ترتیب مصوب بعد
از R5 انجام می‌شوند و جزء R4 محسوب نشده‌اند.
