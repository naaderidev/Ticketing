# رجیستر ریسک بازطراحی محصول

وضعیت: فعال از R0 تا پایان Cutover

| شناسه | ریسک | شدت | کنترل پیشگیرانه | معیار توقف/No-Go | مالک پیشنهادی |
| --- | --- | --- | --- | --- | --- |
| R-001 | نشت داده میان شرکت‌ها | Critical | ABAC، Scope سروری، تست Cross-tenant و Audit | هر مسیر IDOR یا Export خارج Scope | Security |
| R-002 | Migration اشتباه تیکت‌های قدیمی | Critical | Expand/Backfill، گزارش تطبیق، Snapshot پاک‌سازی‌شده | Count/Relation ناسازگار یا رکورد بدون برنامه تعیین تکلیف | Database Owner |
| R-003 | پاسخ نادرست مالی/حقوقی | Critical | داده سرویس مرجع، محتوای Approved، Human approval | هر پاسخ حدسی یا بدون Source | Product + Legal |
| R-004 | از دست رفتن مالک یا SLA در ارجاع | High | Transaction، invariant تیم، TicketEvent، idempotency | Ticket فعال بدون تیم یا Deadline معتبر | Operations |
| R-005 | ناسازگاری وضعیت قدیم و جدید | High | State Machine، Dual read، reconciliation | دو UI وضعیت متناقض نشان دهند | Engineering |
| R-006 | نشت Internal Note | Critical | مدل و DTO جدا، negative test، code review | Internal content در API/Export کاربر | Security |
| R-007 | وابستگی به سرویس‌های ناپایدار | High | timeout، circuit breaker، degraded UX و contract test | ثبت اطلاعات حساس بدون اعتبارسنجی مرجع | Architecture |
| R-008 | اعلان گم‌شده یا تکراری | High | Transactional Outbox، idempotency، retry/DLQ | رویداد مهم بدون Delivery قابل رهگیری | Platform |
| R-009 | محاسبه اشتباه SLA | High | تقویم نسخه‌دار، Clock test، event history | اختلاف با نمونه‌های تأییدشده عملیات | Operations + QA |
| R-010 | رشد Scope و تأخیر Launch | High | V1 ثابت، Feature Flag، انتقال AI/Incident خودکار به بعد | ورود قابلیت خارج Scope بدون Change Approval | Product |
| R-011 | آمار مدیریتی نادرست | High | تعریف KPI نسخه‌دار، Aggregate reconciliation | اختلاف Dashboard و Query مرجع | BI |
| R-012 | بار بیش از ظرفیت Query/Queue | High | pagination، aggregate سرور، load test و index review | عبور از بودجه latency/error مصوب | Engineering |
| R-013 | فایل آلوده یا دسترسی غیرمجاز | Critical | کنترل‌های private S3/scan فعلی + scope جدید | scanner bypass یا download خارج Scope | Security |
| R-014 | دسترسی بیش از حد مدیر سیستم | High | تفکیک نقش، break-glass و audit مشاهده | دسترسی دائمی به محتوای حساس | Security |
| R-015 | Cutover بدون امکان بازگشت عملیاتی | Critical | feature flag، canary، app rollback و DB forward-fix | Migration مخرب یا عدم rehearsal restore | Release Owner |

## قاعده مدیریت

- ریسک Critical بدون Owner، تست و No-Go criterion اجازه ورود به فاز پیاده‌سازی ندارد.
- ریسک High باید قبل از Pilot کنترل و شواهد آن ثبت شود.
- قبول ریسک فقط توسط مالک کسب‌وکار و امنیت، همراه تاریخ انقضا و دلیل مجاز است.
- بسته شدن ریسک به معنی حذف از تاریخچه نیست؛ Evidence باید حفظ شود.
