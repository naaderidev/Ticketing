# فاز R3 — Support Catalog، Team و Queue

وضعیت: Baseline `R3-v1` تأییدشده با شروع صریح فاز R4 توسط مالک پروژه

تاریخ: 2026-09-13

پیش‌نیاز: Baseline دسترسی سازمانی `R2-v1`

## هدف و مرز فاز

R3 کاتالوگ پشتیبانی را از ساختار legacy دپارتمان جدا و به‌صورت نسخه‌دار پیاده می‌کند.
این فاز مالکیت Ticket فعلی را تغییر نمی‌دهد؛ اتصال Ticket به Party، Organization، نوع
درخواست و صف در R4 انجام می‌شود. بنابراین استقرار R3 یک تغییر Expand و قابل خاموش‌کردن
در سطح Application است.

## مدل داده پیاده‌شده

- `SupportService`: شش دامنه کلان خدمت، دارای کد پایدار و وضعیت
- `SupportRequestType`: نوع درخواست، Subject کسب‌وکاری و الزام Root Cause
- `SupportTeam`: مرز سازمانی تیم پشتیبانی
- `SupportQueue`: صف متعلق به تیم و یک صف پیش‌فرض در seed اولیه
- `SupportCatalogRoute`: مسیر نسخه‌دار نوع درخواست به صف و Priority پیش‌فرض
- `LegacySupportCatalogMapping`: صف تطبیق صریح Department/SubDepartment قدیمی
- `UserRoleAssignment.supportTeamId`: Scope واقعی Assignment تیمی با کلید خارجی

قید یکتای `activeKey` تضمین می‌کند هر نوع درخواست حداکثر یک مسیر فعال داشته باشد.
سرویس انتشار نسخه نیز وجود دقیقاً یک مسیر فعال قبلی را کنترل می‌کند تا شکاف یا چندمسیره
شدن پنهان ایجاد نشود.

## Migration و Seed

Migrationهای R3:

1. `20260913110000_support_catalog_team_queue`
2. `20260913111000_normalize_seeded_utc_timestamps`

Migration نخست فقط Table، Column، Index، Foreign Key و داده مرجع جدید اضافه می‌کند.
هیچ Drop/Rename روی Department، SubDepartment یا Ticket ندارد. Migration دوم اختلاف
`CURRENT_TIMESTAMP` و UTC در MySQLهای دارای timezone محلی را فقط برای seedهای شناخته‌شده
R2/R3 اصلاح می‌کند؛ migration اعمال‌شده قبلی بازنویسی نشده است.

نتیجه reconciliation دیتابیس محلی:

| شاخص | مقدار |
| --- | ---: |
| SupportService | 6 |
| SupportRequestType | 11 |
| SupportTeam | 9 |
| SupportQueue | 9 |
| Active Route | 11 |
| نوع درخواست با تعداد مسیر فعال نامعتبر | 0 |
| Department + SubDepartment legacy | 21 |
| Legacy mapping queue | 21 |
| Permissionهای `support.*` | 8 |

## Taxonomy و Routing اولیه

دامنه‌های مصوب حساب/ورود، دسترسی شرکت، مالی، قرارداد، دارایی/اندازه‌گیری و شکایت
پشتیبانی seed شده‌اند. یازده نوع درخواست ACCOUNT_ACCESS، APP_ERROR، COMPANY_ACCESS،
ELECTRICITY_SALE، INVOICE، PAYMENT، CONTRACT، POWER_PLANT، METER، SAVINGS و
SUPPORT_COMPLAINT هرکدام دقیقاً یک Route نسخه 1 دارند.

Department/SubDepartmentهای قدیمی بر اساس تشابه نام نگاشت نشده‌اند. همه 21 رکورد در
وضعیت `PENDING` هستند تا بازبین یکی از خروجی‌های `MAPPED`، `IGNORED` یا `CONFLICT` را
با مقصد صریح ثبت کند.

## API v2

| Method | Path | کاربرد |
| --- | --- | --- |
| GET | `/api/v2/support/catalog` | کاتالوگ مشتری بدون افشای تیم و صف |
| GET | `/api/v2/workspace/queues` | صف‌های مجاز کاربر Workspace |
| GET | `/api/v2/workspace/catalog` | Snapshot مدیریتی کاتالوگ |
| POST | `/api/v2/workspace/catalog/services` | ایجاد خدمت |
| POST | `/api/v2/workspace/support-teams` | ایجاد تیم و صف پیش‌فرض اتمیک |
| POST | `/api/v2/workspace/catalog/request-types` | ایجاد نوع درخواست و Route نسخه 1 |
| POST | `/api/v2/workspace/support-teams/{id}/members` | Assignment کارشناس/سرپرست |
| POST | `/api/v2/workspace/catalog/request-types/{id}/routes` | انتشار Route جدید و بازنشسته‌کردن قبلی |
| PATCH | `/api/v2/workspace/catalog/legacy-mappings/{id}` | ثبت تطبیق دستی legacy |

پاسخ‌ها envelope نسخه 2، `requestId` و `Cache-Control: no-store` دارند. ورودی‌ها strict
هستند، فیلد ناشناخته رد می‌شود و mutationها تحت CSRF proxy، rate limit و Audit قرار دارند.

## دسترسی و عدم افشای اطلاعات

- `SYSTEM_ADMINISTRATOR` و `SUPPORT_MANAGER` مجوزهای مدیریتی سراسری دارند.
- `SUPERVISOR` فقط خواندن کاتالوگ/تیم/صف و Workspace دارد.
- `SUPPORT_AGENT` فقط خواندن کاتالوگ/صف و Workspace دارد.
- Assignment کارشناس و سرپرست با Scope نوع `SUPPORT_TEAM` ثبت می‌شود.
- کاربر غیرسراسری فقط صف تیمی را می‌بیند که Assignment معتبر زمانی برای آن دارد.
- عدم دسترسی به منابع مدیریتی با 404 پنهان می‌شود.
- endpoint مشتری نام تیم، صف، عضو یا تاریخچه داخلی Routing را برنمی‌گرداند.

## رابط کاربری

صفحه `/admin/support-catalog` قابلیت‌های زیر را فراهم می‌کند:

- ایجاد Service، Team و صف پیش‌فرض
- ایجاد Request Type همراه Route اولیه
- تخصیص کارشناس یا سرپرست به Team
- انتشار Route نسخه جدید همراه دلیل ممیزی
- تطبیق دستی داده قدیمی بدون حدس نام
- مشاهده Route فعال، نسخه، Team، Queue و اعضا

Navigation دسکتاپ و موبایل فقط هنگام فعال بودن Workspace جدید نمایش داده می‌شود.

## Feature Flag و Rollback

- `FEATURE_SUPPORT_V2_READ_ENABLED`: خواندن کاتالوگ مشتری
- `FEATURE_AGENT_WORKSPACE_V2_ENABLED`: Workspace و مدیریت کاتالوگ

هر دو Flag در Development/Test به‌صورت پیش‌فرض روشن و در Production به‌صورت پیش‌فرض
خاموش هستند. مقدار نامعتبر باعث خطای تنظیمات می‌شود. Rollback عملیاتی با خاموش‌کردن
Flagها و بازگرداندن نسخه Application انجام می‌شود؛ Schema افزوده‌شده حفظ می‌شود و نیاز
به Drop فوری ندارد.

## شواهد کیفیت

- Prisma schema و 12 migration اعمال‌شده: پاس
- Migration integrity و release-contract: پاس
- TypeScript و ESLint با صفر warning: پاس
- Jest: 49 suite و 309 test پاس
- Next.js MCP/Turbopack compilation issue: صفر
- Runtime صفحه مدیریت، Catalog API و Queue API: پاس
- درخواست بدون نشست به هر سه API خواندنی: 401
- payload دارای کد/نام نامعتبر و فیلد ناشناخته: 400 بدون تغییر داده
- axe accessibility صفحه مدیریت: صفر violation
- Browser/Next runtime error: صفر
- نشست موقت QA پس از تست حذف شد.

## معیار خروج و محدودیت آگاهانه

- مدل کاتالوگ و Routing نسخه‌دار برقرار است.
- هر Request Type فعال دقیقاً یک Route فعال دارد.
- Scope تیمی و جداسازی صف‌ها در query دیتابیس enforce می‌شود.
- صف تطبیق legacy کامل است و هیچ نگاشت خودکاری انجام نشده است.
- API legacy و Ticket فعلی تغییر رفتار اجباری ندارند.
- R4 باید Ticket core را به Party/Organization/RequestType/Queue متصل کند و شمارنده واقعی
  Ticket صف را جایگزین مقدار bootstrap فعلی کند.
