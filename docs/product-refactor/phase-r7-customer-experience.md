# فاز R7 — تجربه مشتری مبتنی بر API v2

وضعیت: کامل — آماده‌ی Canary با Feature Flag مستقل

تاریخ: 2026-09-13

پیش‌نیاز: Baseline فنی `R6` با Providerهای واقعی همچنان خاموش

## هدف و مرز فاز

R7 مسیرهای `/user`، `/user/tickets`، `/user/tickets/new` و
`/user/tickets/:ticketId` را به Catalog، Party Context و Ticket Aggregate نسخه جدید متصل
می‌کند. این فاز Workspace کارشناس، تغییر Schema، حذف API legacy یا فعال‌سازی Providerهای
بیرونی را در بر نمی‌گیرد. رابط قبلی بدون تغییر قرارداد، پشت مسیر rollback باقی مانده است.

## سفرهای پیاده‌سازی‌شده

### داشبورد و Context

- نمایش Context فعال فردی یا سازمانی از Session سمت سرور؛
- نمایش آخرین درخواست‌های همان Context بدون اتکا به `userId` ارسالی Client؛
- برجسته‌سازی درخواست‌های `WAITING_USER` که نیازمند اقدام مشتری‌اند؛
- مسیر مستقیم و responsive برای ایجاد درخواست و مشاهده همه درخواست‌ها.

### ایجاد درخواست

- انتخاب Service و RequestType منتشرشده از Catalog مشتری؛
- نمایش Priority پیش‌فرض و زمان هدف پاسخ اولیه پیش از ثبت؛
- دریافت `ORGANIZATION_MEMBERSHIP` از Context فعال، نه ورودی قابل جعل؛
- انتخاب `RELATED_TICKET` فقط از فهرست scopeشده مشتری؛
- جست‌وجوی Reference بیرونی فقط وقتی R6 صریحاً فعال است؛ در حالت خاموش فرم fail-closed است؛
- آپلود فایل با `uploadId` خصوصی و اتصال در command canonical؛
- نگه‌داشتن Idempotency Key برای retry همان payload و ساخت کلید تازه پس از تغییر payload؛
- نمایش پیام امن API و `requestId` برای پیگیری، بدون افشای جزئیات داخلی.

### فهرست و جزئیات

- وضعیت‌های ساده‌شده مشتری: `IN_PROGRESS`، `WAITING_USER`، `RESOLVED` و `CLOSED`؛
- فیلتر وضعیت و cursor pagination بدون total ساختگی؛
- نمایش Service، RequestType، Priority، Context، SLA و Referenceهای مجاز؛
- Timeline عمومی مبتنی بر Messageهای مشتری/کارشناس، بدون Note یا Event داخلی؛
- پاسخ مشتری با attachment و کنترل هم‌زمانی `If-Match`؛
- تأیید یا رد نتیجه در `RESOLVED`، امتیازدهی و بازگشایی دلیل‌دار در `CLOSED`؛
- refresh خودکار detail در خطای concurrent modification یا transition نامعتبر.

## قراردادهای ایمنی و سازگاری

- تمام writeها از `Idempotency-Key` و برای Aggregate موجود از ETag نسخه‌دار استفاده می‌کنند.
- UI هیچ Party، Organization، Team، Queue یا SLA دلخواهی به API نمی‌فرستد.
- Business Reference خاموش یا ناشناخته با حدس محلی دور زده نمی‌شود.
- داده داخلی Assignment، routing reason، audit و private attachment وارد DTO مشتری نمی‌شود.
- مسیر legacy در زمان خاموش بودن Flag همچنان فعال است؛ Schema یا داده‌ای در R7 تغییر نکرده است.

## Feature Flag و rollout

`FEATURE_CUSTOMER_EXPERIENCE_V2_ENABLED` در development/test در صورت نبود مقدار روشن است تا
rehearsal محلی ممکن باشد، اما در production پیش‌فرض خاموش است. مقدار مبهم باعث fail-fast شدن
runtime configuration می‌شود. چهار route با `connection()` در request-time رندر می‌شوند تا
تغییر Flag یا rollback به artifact و build تازه وابسته نباشد.

ترتیب rollout:

1. deploy همان artifact با Flag خاموش و اجرای release gates؛
2. اجرای `npm run test:r7-runtime` روی محیط rehearsal؛
3. Canary برای گروه محدود همراه پایش 4xx/5xx، create success، latency و اختلاف شمارش؛
4. افزایش تدریجی cohort پس از صفر بودن رخداد cross-context و خطای attachment؛
5. rollback آنی با خاموش‌کردن Flag؛ هیچ rollback دیتابیس لازم نیست.

## شواهد و گیت‌ها

- unit test برای default production، مقادیر صریح و config مبهم Feature Flag؛
- hook contract test برای Catalog، create، transition، Idempotency، ETag و request ID؛
- `npm run test:r7-runtime` برای رندر چهار مسیر مشتری و جریان واقعی catalog → create → list → reply → detail؛
- lint، typecheck، test suite، release contract، Prisma validation و production build؛
- بررسی runtime مرورگر با Next dev loop برای خطاهای console/network و responsive layout.

## معیارهای No-Go

- هر دسترسی یا نمایش cross-party/cross-organization؛
- امکان ثبت Reference الزامی بدون verification معتبر؛
- از دست‌رفتن attachment یا ایجاد Ticket نیمه‌کاره؛
- duplicate Ticket در retry یک payload؛
- پذیرش write بدون version معتبر یا عدم بازیابی UI پس از conflict؛
- نمایش Note، Assignment، escalation recipient یا داده Provider خام به مشتری؛
- نرخ خطای create/reply یا latency بالاتر از آستانه مصوب Canary؛
- نبود مسیر rollback آزمایش‌شده به UI legacy.

## Definition of Done

- چهار مسیر اصلی مشتری پشت Flag مستقل به API v2 متصل باشند.
- جریان فردی و سازمانی فقط از Context معتبر Session استفاده کند.
- وضعیت، SLA، Reference، attachment، reply، resolution، rating و reopen مطابق قرارداد باشند.
- API legacy و UI legacy تا Cutover نهایی قابل بازگشت باقی بمانند.
- تمام تست‌ها و شواهد بالا سبز و هیچ No-Go فعالی برای Canary باقی نمانده باشد.
