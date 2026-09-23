# R0 Decision Register

وضعیت: Baseline محصول تأییدشده — `R0-v1`

مقادیر وضعیت: `BLOCKING`، `PROPOSED`، `APPROVED`، `REJECTED`

تأییدکننده: مالک پروژه از طریق تأیید صریح «بسته R0 تأیید است» در Task جاری Codex

تاریخ تأیید: 2026-09-13

تصمیم‌های دارای نیاز حقوقی، امنیتی، عملیاتی یا زیرساختی به‌عنوان Baseline محصول تأیید
شده‌اند، اما فعال‌سازی Production آن‌ها همچنان به گیت تخصصی مندرج در
`r0-approval-pack.md` وابسته است.

| شناسه | تصمیم | پیشنهاد اولیه | وضعیت | مالک تأیید | اثر در صورت تأخیر |
| --- | --- | --- | --- | --- | --- |
| D-001 | گروه‌های کاربری دقیق V1 | B2C، نماینده و مدیر شرکت، کارشناس، سرپرست، مدیر پشتیبانی و مدیر سیستم | APPROVED | Product | Scope فرانت، Party و Permission نامشخص می‌ماند |
| D-002 | پنج موضوع اول V1 | پنج Macro Domain مصوب Approval Pack و مسیر مستقل شکایت | APPROVED | Product + Operations | Taxonomy، فرم‌ها و Integrationها قفل نمی‌شوند |
| D-003 | مالک در حالت UNASSIGNED | تیم مسئول الزامی؛ کارشناس می‌تواند موقتاً خالی باشد و سرپرست صف مسئول SLA است | APPROVED | Product + Operations | State Machine و constraint مالکیت مبهم می‌ماند |
| D-004 | SLA هر موضوع | چهار سطح CRITICAL/HIGH/NORMAL/LOW مطابق Approval Pack | APPROVED | Operations + Legal | Deadline و Escalation قابل پیاده‌سازی نیست |
| D-005 | تقویم SLA | Asia/Tehran، شنبه تا چهارشنبه ۰۸:۰۰–۱۷:۰۰؛ CRITICAL تقویمی و Pause فقط در WAITING_USER | APPROVED | Operations | محاسبه زمان نادرست خواهد بود |
| D-006 | کانال‌های V1 | وب/اپ، اعلان داخل اپ و ایمیل؛ پیامک محدود به رویدادهای حساس | APPROVED | Product + Infrastructure | Notification architecture و هزینه نامشخص می‌ماند |
| D-007 | سرویس‌های قابل اتصال | Identity/Party، Organization/Access، Contract، Finance، Meter، PowerPlant و Notification از طریق Adapter | APPROVED | Architecture + Service Owners | انتخاب Business Subject واقعی ممکن نیست |
| D-008 | طبقه‌بندی داده حساس | مدل پنج‌سطحی و حداقل Restricted برای هویت/مالی/قرارداد/نمایندگی/فایل | APPROVED | Security + Legal | Masking، Audit و دسترسی ناقص می‌ماند |
| D-009 | دامنه اختیار نماینده شرکت | اشتراک Scope شرکت + شعبه/قرارداد/دارایی + بازه اعتبار | APPROVED | Product + Legal | خطر Cross-tenant access ایجاد می‌شود |
| D-010 | تأیید تغییر حساس | تأیید مدیر مجاز شرکت و تأیید دوم داخلی برای حساب/پرداخت | APPROVED | Legal + Customer Affairs | Workflow تأیید مشخص نیست |
| D-011 | بستن خودکار | سه روز کاری و دو یادآوری؛ بازگشایی هفت روز تقویمی | APPROVED | Product + Operations | Lifecycle ناقص می‌ماند |
| D-012 | سیاست حذف کاربر | حذف تیکت ممنوع؛ بستن فقط از چرخه حل/تأیید و حذف فیزیکی فقط Retention | APPROVED | Product + Legal | Retention و Audit متاثر می‌شود |
| D-013 | Build یا Buy هسته | Modular Monolith فعلی برای V1 و ارزیابی Buy پس از Pilot | APPROVED | Product + Architecture + Finance | برنامه هزینه و زمان قطعی نمی‌شود |
| D-014 | ساعات و مسیر Escalation | هشدار در ۷۰٪/۹۰٪، سرپرست در ۱۰۰٪ و مدیر پشتیبانی در ۱۲۵٪ | APPROVED | Operations | هشدارها و On-call مبهم می‌ماند |
| D-015 | Incident در Launch | پیش‌بینی Schema در V1؛ مدیریت دستی و UI در V1.1 | APPROVED | Product | Scope و زمان Launch تغییر می‌کند |
| D-016 | AI در Launch | AI خارج Launch؛ دانش Approved و Rule-based suggestion در V1 | APPROVED | Product + Security + Legal | ریسک پاسخ نادرست و Scope زیاد می‌شود |
| D-017 | Retention | مقادیر اولیه Approval Pack با گیت الزامی Legal/Compliance | APPROVED | Legal + Security | Storage lifecycle و حذف قانونی ممکن نیست |
| D-018 | KPI رسمی | قرارداد محاسباتی نسخه‌دار `KPI-V1` در `kpi-definitions.md`؛ قواعد Cohort، FCR، CSAT، Reopen، Scope و داده ناموجود قطعی است | APPROVED | Product + BI | گزارش‌های متناقض ساخته می‌شود |
| D-019 | مشتری مهم/Account Manager | فقط Contract Plan واجد خدمت؛ بدون دورزدن Scope | APPROVED | Sales + Product | مسیر B2B ویژه مبهم می‌ماند |
| D-020 | ناشناس بودن مرکز دانش | فقط PUBLIC+APPROVED+ACTIVE ناشناس؛ عملیات تیکت نیازمند Login | APPROVED | Product + Security | Route policy و SEO/UX متفاوت می‌شود |

## سابقه تأیید

- نسخه: `R0-v1`
- نتیجه: هر ۲۰ تصمیم محصول تأیید شد.
- تأییدکننده: مالک پروژه در Task جاری Codex
- تاریخ: 2026-09-13
- استثنا: گیت‌های تخصصی Production در Approval Pack حذف نشده‌اند.

## تثبیت قرارداد KPI

- نسخه: `KPI-V1`
- نتیجه: قرارداد هر ۹ شاخص بخش ۱۵ تثبیت شد.
- مرجع: دستور صریح مالک پروژه برای اجرای فاز صفر KPI در Task جاری Codex
- تاریخ: 2026-09-14
- اثر: D-018 از تعریف کلی به قرارداد محاسباتی قابل پیاده‌سازی تفصیل یافت؛ Scope سایر
  تصمیم‌های R0 تغییر نکرد.

هر تغییر بعدی باید شناسه Decision، دلیل، مالک، تاریخ و اثر آن بر Scope/API/Schema/Migration
را ثبت کند و نسخه Baseline را افزایش دهد.
