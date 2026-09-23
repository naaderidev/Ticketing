# فاز R5 — SLA و Routing Runtime

وضعیت: پیاده‌سازی کامل — آماده تأیید Baseline `R5-v1`

تاریخ: 2026-09-13

پیش‌نیاز: Baseline هسته Ticket نسخه `R4-v1`

## هدف و مرز فاز

این فاز تصمیم Routing هر Ticket را قابل ممیزی می‌کند و Policy و تقویم SLA نسخه‌دار را به
snapshot مستقل هر Ticket تبدیل می‌کند. محاسبه deadline، توقف فقط در `WAITING_USER`،
First Response، Resolution، هشدارهای ۷۰/۹۰، breach در ۱۰۰ و escalation مدیر در ۱۲۵ درصد
پیاده‌سازی شده‌اند.

ارسال اعلان SLA از محاسبه جدا است. ثبت snapshot، state و event حتی در حالت observe-only
انجام می‌شود، اما اعلان فقط برای snapshotهای `ENFORCED` ساخته می‌شود. مدیریت UI تقویم و
Policy، Workspace کامل کارشناس و اتصال Provider اعلان جزو فازهای بعدی است.

## مدل داده افزایشی

- `SlaCalendar` و `SlaHoliday`: تقویم IANA نسخه‌دار، برنامه هفتگی و تعطیلات محلی؛
- `SlaPolicy`: Policy نسخه‌دار برحسب Priority، نوع ساعت، هدف پاسخ اول و حل و آستانه‌ها؛
- `TicketSla`: snapshot Policy/Calendar، deadlineها، stateها، pause و نتیجه نهایی هر Ticket؛
- `TicketSlaPause`: تاریخچه append-only توقف با قید حداکثر یک pause فعال برای هر SLA؛
- `RoutingDecision`: Route، Team، Queue، Policy، Actor، منبع، نسخه Rule و دلیل تصمیم؛
- `OutboxDelivery`: ledger مستقل هر Consumer با status، attempt، قفل، retry و dead-letter؛
- `SupportCatalogRoute.slaPolicyId`: اتصال Route نسخه‌دار به Policy انتخاب‌شده.

تمام تغییرهای Schema افزایشی‌اند. Ticket قدیمی، Route، Event یا Outbox حذف یا بازنویسی
نشده است. Policyهای پایه `CRITICAL`، `HIGH`، `NORMAL` و `LOW` و تقویم کاری
`IR_STANDARD_WORK_WEEK` seed شده‌اند.

## Policy پایه و تقویم

| Policy | Clock | پاسخ اول | حل |
| --- | --- | ---: | ---: |
| `BASE_CRITICAL` | تقویمی ۲۴×۷ | ۱۵ دقیقه | ۲۴۰ دقیقه |
| `BASE_HIGH` | کاری | ۱۲۰ دقیقه | ۵۴۰ دقیقه |
| `BASE_NORMAL` | کاری | ۲۴۰ دقیقه | ۱۶۲۰ دقیقه |
| `BASE_LOW` | کاری | ۵۴۰ دقیقه | ۲۷۰۰ دقیقه |

تقویم کاری پایه با timezone `Asia/Tehran`، شنبه تا چهارشنبه ۰۸:۰۰–۱۷:۰۰ و پنج‌شنبه/
جمعه تعطیل است. لیست تعطیلات رسمی عمداً خالی مانده تا منبع authoritative واحد عملیات
اعلام شود. به همین دلیل فعال‌سازی enforcement پیش از تکمیل تعطیلات، No-Go است.

محاسبه با `Intl` و timezone IANA انجام می‌شود و شروع خارج از ساعت کاری، پایان روز، آخر هفته،
تعطیلات، بازه‌های چندروزه و سقف traversal کنترل شده‌اند. Deadlineهای محاسبه‌شده روی Ticket
ذخیره می‌شوند و Route یا Owner بعدی آن‌ها را reset نمی‌کند.

## قواعد چرخه SLA

- Ticket native هنگام ایجاد، دقیقاً یک `RoutingDecision` و یک `TicketSla` می‌گیرد.
- Policy از Route فعال همان لحظه انتخاب می‌شود؛ Client اجازه ارسال Team/Queue/Priority/SLA
  را ندارد.
- Ticketهای historical legacy با `NOT_APPLICABLE` backfill می‌شوند؛ برای گذشته breach
  یا Resolution ساختگی تولید نمی‌شود.
- اولین پاسخ عمومی Staff فقط یک بار First Response را `MET` یا `BREACHED` می‌کند.
- رویداد `ticket.customer_input_requested.v1` فقط Resolution SLA را pause می‌کند.
- پاسخ Customer در `WAITING_USER` pause را می‌بندد و deadlineهای Resolution را به اندازه
  زمان مؤثر SLA جابه‌جا می‌کند. First Response هرگز جابه‌جا نمی‌شود.
- Resolve هنگام pause، رکورد pause فعال را اتمیک می‌بندد تا تاریخچه نیمه‌کاره باقی نماند.
- انتقال Team/Queue و تغییر Owner، SLA را reset نمی‌کند.
- بازگشایی فعلاً SLA حل‌شده قبلی را restart نمی‌کند. این رفتار محافظه‌کارانه است و تا تأیید
  صریح Product درباره restart یا ادامه SLA، enforcement نباید فعال شود.

## Threshold و اعلان

| درصد | اثر state/event | گیرنده در حالت enforced |
| ---: | --- | --- |
| ۷۰ | `sla.warning_reached.v1` | Owner |
| ۹۰ | `sla.warning_reached.v1` | Owner و Supervisor Team |
| ۱۰۰ | `sla.breached.v1` | Supervisor Team |
| ۱۲۵ Resolution | `sla.escalated.v1` | Support Manager سراسری |

هر عبور با compare-and-set اتمیک ثبت می‌شود؛ اجرای هم‌زمان دو worker event یا notification
تکراری تولید نمی‌کند. snapshotهای `OBSERVE_ONLY` همان state/event را برای مقایسه KPI ثبت
می‌کنند، ولی notification ندارند.

## Outbox consumer

Consumer با نام `SLA_ROUTING_V1` برای هر `OutboxEvent` یک `OutboxDelivery` یکتا می‌سازد.
Claim با token تصادفی، update شرطی و lock منقضی‌شونده انجام می‌شود. تکمیل Delivery و
`publishedAt` سازگار Outbox در یک transaction ثبت می‌شوند؛ failure نیز attempt و retry را
اتمیک به‌روزرسانی می‌کند.

ترتیب هر Ticket حفظ می‌شود: تا زمانی که event قدیمی‌تر همان aggregate موفق نشده باشد، event
بعدی claim نمی‌شود. retry با backoff نمایی محدود انجام می‌شود و پس از سقف تنظیم‌شده به
`DEAD_LETTER` می‌رود. متن خطای حساس ذخیره نمی‌شود و فقط نوع عمومی خطا نگه‌داری می‌شود.

## Endpoint و پیکربندی عملیاتی

`POST /api/internal/sla/process` عملیات bounded زیر را انجام می‌دهد:

1. backfill resumable برای Ticketهای فاقد snapshot؛
2. sweep آستانه‌های SLA؛
3. seed و پردازش OutboxDelivery.

Endpoint دارای bearer token مستقل، مقایسه constant-time، دو rate limit، Audit موفق/ناموفق
و پاسخ خطای استاندارد است. متغیرهای جدید:

- `SLA_MAINTENANCE_TOKEN` با حداقل ۳۲ کاراکتر؛
- `SLA_JOB_BATCH_SIZE` بین ۱ تا ۵۰۰، پیش‌فرض ۱۰۰؛
- `SLA_JOB_LOCK_SECONDS` بین ۳۰ تا ۹۰۰، پیش‌فرض ۱۲۰؛
- `OUTBOX_MAX_ATTEMPTS` بین ۱ تا ۲۰، پیش‌فرض ۵؛
- `FEATURE_OUTBOX_DISPATCH_ENABLED=false`؛
- `FEATURE_SLA_ENFORCEMENT_ENABLED=false`.

دو flag جدید در صورت نبودن مقدار نیز خاموش‌اند؛ Production هیچ default فعال ضمنی ندارد.
Scheduler باید endpoint را حداقل هر دقیقه فراخوانی کند و روی خطای job، backlog retry و هر
dead-letter هشدار بدهد.

## Migration و اصلاح timezone

Migrationهای R5:

1. `20260913130000_sla_routing_runtime` — جدول‌ها، constraintها، indexها، Policyها، اتصال
   Route، RoutingDecision تاریخی، ledger Outbox و Permissionها؛
2. `20260913131000_normalize_sla_seeded_utc_timestamps` — نرمال‌سازی محدود timestampهای
   seed R5 در MySQLهایی که session timezone آن‌ها UTC نیست.

Migration دوم فقط seedهای شناخته‌شده و future-dated را اصلاح می‌کند. کشف آن در runtime
smoke مانع پنهان ماندن اختلاف ۳:۳۰ ساعته سرور تهران شد. هر دو migration forward-only و فاقد
drop، truncate یا delete هستند.

## Reconciliation دیتابیس محلی

| کنترل | نتیجه |
| --- | ---: |
| Migration اعمال‌شده | ۱۹، schema همگام |
| Ticket / TicketSla | ۶۱ / ۶۱ |
| Policy / Calendar | ۴ / ۱ |
| RoutingDecision | ۶۱ |
| OutboxEvent / OutboxDelivery | ۱۸۳ / ۱۸۳ |
| Delivery موفق | ۱۸۳ |
| Pending / Processing / Retry / Dead Letter | ۰ / ۰ / ۰ / ۰ |
| Ticket بدون SLA یا RoutingDecision | ۰ |
| Route فعال بدون SLA Policy | ۰ |
| snapshot تاریخی نامعتبر | ۰ |
| pause فعال/تکراری/ناسازگار | ۰ / ۰ / ۰ |
| ترتیب milestone نامعتبر | ۰ |

`npm run verify:r5-data` تمام invariantهای بالا را fail-closed کنترل می‌کند.

## شواهد runtime و کیفیت

- Smoke کامل R4 پس از فعال شدن Policy: create/replay، ETag، idempotency، transition،
  cross-party و cursor همگی با status مورد انتظار پاس شدند و داده آزمایشی پاک شد.
- Smoke R5 یک Ticket native ساخت، Policy `BASE_HIGH` و یک RoutingDecision را تأیید کرد،
  pause/resume واقعی را با یک history بسته‌شده اجرا کرد و هر ۸ event آزمایشی را بدون backlog
  یا dead-letter تحویل داد؛ داده آزمایشی در پایان حذف شد.
- schema Prisma معتبر است، migration status پاک است، lint و TypeScript بدون خطا هستند.
- تست واحد/یکپارچگی/امنیتی و coverage gate پاس است.
- production build Next.js موفق و audit وابستگی production بدون vulnerability است.

## Rollout و rollback

1. migrationها را با image مهاجرت اجرا و `npm run verify:r5-data` را ثبت کنید.
2. token مستقل و scheduler را بسازید؛ هر دو flag را خاموش نگه دارید.
3. Outbox dispatch را فقط در staging روشن کنید، backlog را drain و اجرای دوم idempotent را
   اثبات کنید. Enforcement همچنان خاموش بماند.
4. KPI observe-only را با محاسبه مرجع عملیات مقایسه کنید.
5. تعطیلات رسمی، targetها، گیرندگان escalation و رفتار reopen را کتبی تأیید کنید.
6. Enforcement را ابتدا برای Ticketهای جدید pilot/canary فعال کنید؛ snapshotهای قبلی به‌طور
   خودکار تغییر حالت نمی‌دهند.
7. rollback اپلیکیشن با خاموش کردن دو flag انجام می‌شود؛ schema و ledger حذف نمی‌شوند.

## No-Goهای فعال‌سازی enforcement

- نبود فهرست تعطیلات رسمی از منبع authoritative عملیات؛
- نبود تأیید Product برای semantics بازگشایی؛
- نبود تأیید Operations برای targetها و مالک واقعی escalation در محیط مقصد؛
- هر اختلاف در `verify:r5-data`، هر dead-letter، backlog غیرعادی یا خطای ترتیب aggregate؛
- نبود scheduler، alert و runbook بازیابی Delivery.

این موارد مانع deploy کد در حالت observe-only نیستند، اما مانع روشن کردن
`FEATURE_SLA_ENFORCEMENT_ENABLED` هستند.
