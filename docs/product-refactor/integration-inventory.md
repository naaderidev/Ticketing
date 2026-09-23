# فهرست Integrationهای موردنیاز

وضعیت: Discovery — Endpoint، Owner و SLA سرویس‌ها هنوز باید تکمیل شوند

زیرساخت مشترک فاز R6 (Port/Adapter، قرارداد نسخه‌دار، context binding، timeout و snapshot
حداقلی) پیاده‌سازی شده است؛ این تغییر Discovery هیچ Provider واقعی را به وضعیت Ready تبدیل
نمی‌کند. ستون مالک/Endpoint و Contract Test هر سطر همچنان گیت فعال‌سازی Production است.

| سرویس | داده موردنیاز | عملیات | منبع حقیقت | رفتار زمان قطعی | مالک/Endpoint |
| --- | --- | --- | --- | --- | --- |
| Identity/Party | فرد، موبایل، شناسه هویتی Mask‌شده | خواندن هویت و اعتبار Session | سرویس هویت | جلوگیری از عملیات حساس؛ نمایش Snapshot مجاز | نامشخص |
| Organization/Access | شرکت، شعبه، عضویت، نقش و Scope | اعتبارسنجی نماینده و مدیر | سرویس سازمان/دسترسی | Fail closed برای داده شرکتی | نامشخص |
| Contract | قرارداد، نسخه، وضعیت و سطح خدمت | جست‌وجو/خواندن Reference | سرویس قرارداد | ایجاد Draft ممکن؛ ارسال نهایی وابسته به اعتبارسنجی | نامشخص |
| Finance | فاکتور، پرداخت، تسویه | خواندن وضعیت و Reference | سرویس مالی | عدم حدس یا استفاده از داده قدیمی بدون برچسب | نامشخص |
| Power Plant | نیروگاه و رکورد تولید | جست‌وجو/خواندن | سرویس نیروگاه | ثبت تیکت با Reference تاییدشده قبلی؛ اعلام اختلال | نامشخص |
| Meter/Site | کنتور، محل مصرف و دوره قرائت | جست‌وجو/خواندن | سرویس اندازه‌گیری | عدم نمایش داده خارج Scope | نامشخص |
| Saving Program | برنامه، پاداش و محاسبه | خواندن نتیجه | سرویس صرفه‌جویی | عدم محاسبه محلی جایگزین | نامشخص |
| Notification | Push/In-app/Email/SMS | ارسال و دریافت Delivery Status | سرویس اعلان/Provider | Outbox + Retry + Dead Letter | نامشخص |
| Object Storage | فایل خصوصی و Metadata | Upload/Download/Delete | S3-compatible storage | Fail closed در Upload؛ Download موجود ادامه یابد | تصمیم زیرساخت باز |
| Malware Scanner | نتیجه اسکن فایل | Scan | ClamAV-compatible | در Production کاملاً Fail closed | تصمیم زیرساخت باز |

## قرارداد حداقلی هر Integration

- شناسه و Version قرارداد API
- محیط Sandbox/Staging
- AuthN/AuthZ ماشین‌به‌ماشین
- Timeout و Retry مجاز
- Idempotency
- Rate Limit
- Error taxonomy
- مالک سرویس و On-call
- Availability/SLA
- داده‌های حساس و سیاست Cache
- Contract test و Test fixture
- سیاست تغییر ناسازگار و Deprecation

## قاعده ذخیره‌سازی Reference

برای موضوع کسب‌وکار فقط این اطلاعات در Ticketing نگه‌داری می‌شود:

- `sourceSystem`
- `entityType`
- `externalId`
- Snapshot نمایشی حداقلی و Mask‌شده
- زمان دریافت Snapshot
- Version یا ETag در صورت وجود

مبلغ جاری، وضعیت حقوقی جاری یا نتیجه محاسبه نباید بدون نیاز قانونی به‌عنوان منبع حقیقت در
Ticketing تکثیر شود.

## معیار آماده بودن Integration

یک Integration زمانی آماده اجرای فاز فنی است که Owner، Endpoint، قرارداد، Scope امنیتی،
Sandbox، Timeout، رفتار خطا، داده حساس و Contract Test آن مشخص و تأیید شده باشند.
