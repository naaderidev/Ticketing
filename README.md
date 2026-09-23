# Ticketing System — سامانه جامع پشتیبانی

یک سامانه تیکتینگ فارسی و راست‌چین برای ارائه جریان کامل پشتیبانی مشتریان فردی و
سازمانی است. پروژه علاوه بر ثبت و پیگیری درخواست، فضای کاری کارشناسان، ساختار تیم و صف،
SLA، پایگاه دانش، رخدادهای عمومی، اعلان‌ها و داشبورد مدیریتی KPI را پوشش می‌دهد.

> این مخزن یک نسخه **Demo** است. حساب‌های نمایشی، ورود سریع و امکان اجرای HTTP عمداً
> فعال شده‌اند و پروژه برای نگهداری اطلاعات واقعی یا انتشار عمومی اینترنتی طراحی نشده است.

## قابلیت‌ها

- لندینگ ۱۲ حساب دمو با ورود مستقیم به پنل همان نقش؛
- سفر مشتری فردی B2C، مشتری سازمانی B2B و پشتیبانی پیشگیرانه؛
- مرکز پشتیبانی شامل جست‌وجوی سؤال، موضوعات پرتکرار، گفتگو و درخواست‌های من؛
- ویزارد ثبت تیکت بر اساس خدمت، نوع درخواست و موضوع کسب‌وکار؛
- چرخه کامل تیکت از `NEW` تا `CLOSED` و `REOPENED`؛
- تخصیص مالک، انتقال تیم و صف، همکار، ارجاع داخلی و Work Item؛
- پاسخ عمومی، یادداشت داخلی، فایل پیوست و پاسخ‌های آماده دسته‌بندی‌شده؛
- مدیریت سازمان، اعضا، نمایندگان، محدوده دسترسی و درخواست تغییر عضویت؛
- ساختار پشتیبانی شامل خدمات، انواع درخواست، تیم‌ها، صف‌ها و قواعد مسیریابی؛
- SLA پاسخ اولیه و حل، هشدارهای ۷۰٪ و ۹۰٪، نقض تعهد و تشدید خودکار؛
- پایگاه دانش و جریان پاسخ خودکار یا تبدیل گفتگو به تیکت؛
- رخداد عمومی برای اختلال‌های مشترک چند کاربر و اطلاع‌رسانی به افراد تحت تأثیر؛
- اعلان‌های خوانده‌شده و خوانده‌نشده برای مشتری و تیم پشتیبانی؛
- تقویم، Date Picker و نمایش تاریخ شمسی با زبان فارسی؛
- کنترل دسترسی مبتنی بر نقش، تیم، صف، سازمان و محدوده داده؛
- ثبت رخداد دامنه، Outbox و Projection گزارش‌گیری؛
- داشبورد مدیریتی و خروجی CSV.

## نقش‌های نمایشی

Seed پروژه ۱۲ حساب را با نقش‌های زیر می‌سازد:

- مدیر سیستم؛
- مدیر پشتیبانی؛
- سرپرست پشتیبانی؛
- کارشناس پشتیبانی؛
- مدیر حساب سازمانی؛
- ممیز؛
- کارشناس گزارش؛
- مدیر شرکت؛
- نماینده شرکت؛
- مشتری فردی.

اطلاعات حساب‌ها در `src/config/demo-accounts.json` قرار دارد. برای ورود لازم نیست رمز را
دستی وارد کنید؛ در صفحه اصلی روی «ورود با این نقش» بزنید.

## شاخص‌های داشبورد مدیریتی

داده Seed برای نمایش شاخص‌های زیر آماده شده است:

- زمان اولین پاسخ؛
- زمان حل کامل؛
- حل در اولین ارتباط یا FCR؛
- رعایت SLA؛
- بازشدن دوباره تیکت؛
- رضایت مشتری یا CSAT؛
- حل خودکار؛
- تیکت به ازای تراکنش؛
- مشکلات پرتکرار و Drill-down تیکت‌ها.

## فناوری‌ها

- Node.js `24.21.0` و npm 11؛
- Next.js `16.3.4` با App Router و خروجی Standalone؛
- React `19.2.8` و TypeScript؛
- Tailwind CSS 4 و کامپوننت‌های shadcn/ui؛
- Prisma `5.22` و MySQL؛
- Zod برای اعتبارسنجی قراردادها؛
- `react-multi-date-picker 4.5.2` برای تاریخ شمسی؛
- Jest و Testing Library؛
- Playwright برای تست مرورگر.

## پیش‌نیازها

- Node.js 24؛
- npm 11؛
- MySQL 8؛
- Git؛
- Windows PowerShell یا یک Shell سازگار.

نسخه صحیح Node در فایل `.nvmrc` ثبت شده است.

## نصب و راه‌اندازی محلی بدون Docker

### ۱. دریافت پروژه

```powershell
git clone https://github.com/naaderidev/Ticketing.git
cd Ticketing
```

### ۲. نصب وابستگی‌ها

```powershell
npm ci
```

### ۳. ساخت فایل تنظیمات

```powershell
Copy-Item .env.example .env
notepad .env
```

حداقل این مقادیر را متناسب با سیستم خود اصلاح کنید:

```dotenv
DATABASE_URL="mysql://USER:PASSWORD@127.0.0.1:3306/ticketing_system"
APP_ORIGIN="http://localhost:3000"
DEPLOYMENT_VERSION="demo-development"
```

دیتابیس MySQL باید از قبل وجود داشته باشد و کاربر آن مجوز ساخت و حذف جدول‌ها را داشته
باشد.

### ۴. ساخت Prisma Client

```powershell
npx prisma generate
```

### ۵. ساخت schema و Seed کامل

```powershell
npm run db:bootstrap-demo
```

این فرمان عمداً مخرب است و عملیات زیر را انجام می‌دهد:

1. تمام جدول‌ها و داده‌های دیتابیس دمو را reset می‌کند؛
2. schema را مستقیماً از `prisma/schema.prisma` می‌سازد؛
3. کاربران، نقش‌ها، سازمان، تیم‌ها، صف‌ها و دسترسی‌ها را ایجاد می‌کند؛
4. تیکت‌ها، پیام‌ها، اعلان‌ها، SLA، دانش و اطلاعات گزارش‌گیری را Seed می‌کند؛
5. کامل بودن داده‌های نمایشی را در یک تراکنش کنترل می‌کند.

پروژه بنا بر قرارداد نسخه دمو **هیچ فایل migration ندارد**. بنابراین از
`prisma migrate deploy` استفاده نکنید.

### ۶. اجرای Development

روی پورت پیش‌فرض ۳۰۰۰:

```powershell
npm run dev
```

یا روی پورت ارائه ۳۰۰۹:

```powershell
npm run dev:demo
```

سپس یکی از آدرس‌های زیر را باز کنید:

- `http://localhost:3000`
- `http://localhost:3009`

## اجرای Production بدون Docker

در سرور فایل `.env` را ایجاد و حداقل این مقادیر را تنظیم کنید:

```dotenv
DATABASE_URL="mysql://USER:PASSWORD@127.0.0.1:3306/ticketing_system"
APP_ORIGIN="http://172.20.40.214:3009"
DEPLOYMENT_VERSION="demo-production"
DEMO_MODE="true"
NEXT_PUBLIC_DEMO_MODE="true"
ALLOW_DEMO_DATABASE_RESET="true"
DEMO_DATABASE_RESET_NAME="ticketing_system"
```

برای نصب اولیه و ساخت دیتابیس:

```powershell
npm ci
npx prisma generate
npm run db:bootstrap-demo
npm run build
```

برای اجرای برنامه:

```powershell
$env:HOSTNAME="0.0.0.0"
$env:PORT="3009"
npm run start
```

Scheduler باید در یک Process یا Windows Service جداگانه همیشه فعال باشد:

```powershell
npm run scheduler:maintenance
```

پس از اجرا:

- برنامه: `http://172.20.40.214:3009`
- Liveness: `http://172.20.40.214:3009/api/health/live`
- Readiness: `http://172.20.40.214:3009/api/health/ready`

در صورت بسته‌بودن پورت، PowerShell را با دسترسی Administrator باز کنید:

```powershell
New-NetFirewallRule `
  -DisplayName "Ticketing Demo 3009" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 3009 `
  -Action Allow
```

> در انتشارهای بعدی فقط زمانی `db:bootstrap-demo` را اجرا کنید که قصد پاک‌کردن و ساخت
> دوباره کل داده‌های دمو را دارید. این پروژه مسیر Migration افزایشی و بدون حذف داده ندارد.

## اجرای اختیاری با Docker

```powershell
docker compose `
  --env-file .env.demo.example `
  -f compose.demo.yml `
  up --build --detach
```

Compose شامل MySQL، Bootstrap دیتابیس، برنامه و Scheduler است. جزئیات بیشتر در
`docs/demo-deployment.md` قرار دارد.

## محتوای Seed

Bootstrap فعلی حداقل موارد زیر را می‌سازد:

- ۱۲ حساب نقش‌دار؛
- ۵۵ تیکت در تمام وضعیت‌های اصلی؛
- ۸ خدمت و ۱۱ نوع درخواست؛
- ۹ تیم و ۱۱ صف؛
- یک سازمان نمونه و دسترسی‌های سازمانی؛
- پاسخ‌های آماده و مقالات دانش؛
- رخداد عمومی و مشتریان تحت تأثیر؛
- اعلان‌های خوانده‌شده و خوانده‌نشده؛
- ۵۵ Fact سالم گزارش‌گیری؛
- ۱۲ Journey حل خودکار؛
- ۱۴۰۰ رکورد حجم تراکنش؛
- نمونه‌های SLA، FCR، CSAT، Reopen و مشکلات پرتکرار.

کنترل Seed:

```powershell
npm run verify:demo-accounts
npm run verify:reporting-demo-data
```

## متغیرهای محیطی مهم

| متغیر | کاربرد |
| --- | --- |
| `DATABASE_URL` | اتصال MySQL |
| `APP_ORIGIN` | مبدأ دقیق مرورگر برای CSRF و ورود |
| `DEMO_MODE` | فعال‌سازی رفتار یکسان development و production-demo |
| `NEXT_PUBLIC_DEMO_MODE` | فعال‌سازی رفتار نمایشی سمت کاربر |
| `ALLOW_DEMO_DATABASE_RESET` | اجازه صریح reset دیتابیس دمو |
| `DEMO_DATABASE_RESET_NAME` | تأیید نام دیتابیسی که مجاز به reset است |
| `JWT_SECRET` | امضای نشست‌ها |
| `SECURITY_HASH_SECRET` | هش‌کردن شناسه‌های امنیتی |
| `ATTACHMENT_STORAGE_DRIVER` | `filesystem` یا `s3` |
| `ATTACHMENT_LOCAL_STORAGE_PATH` | مسیر خصوصی فایل‌ها در حالت filesystem |
| `SLA_MAINTENANCE_TOKEN` | احراز Scheduler مربوط به SLA و Lifecycle |
| `REPORTING_MAINTENANCE_TOKEN` | احراز Projection و Jobهای گزارش‌گیری |
| `REPORTING_ROLLOUT_STAGE` | مرحله فعال‌سازی Reporting؛ برای دمو `GENERAL` |

تمام متغیرهای موردنیاز و Feature Flagها در `.env.example` مستند شده‌اند.

## Development و Production-demo

برای جلوگیری از تفاوت رفتاری محیط‌ها، Feature Flagهای دمو در هر دو محیط صریحاً فعال‌اند.
تفاوت فقط در مقادیر وابسته به میزبان مانند `APP_ORIGIN`، `DATABASE_URL`، پورت و شناسه
Deployment است. در حالت دمو:

- HTTP مجاز است؛
- کوکی نشست روی HTTP کار می‌کند؛
- CSRF همچنان فعال است و فقط مبدأ دقیق را قبول می‌کند؛
- فایل‌ها خارج از `public` ذخیره می‌شوند؛
- Provider موضوعات کسب‌وکار به‌صورت داخلی و نمایشی اجرا می‌شود.

## تاریخ شمسی

تاریخ‌ها در UI و قراردادهای عمومی API با زبان فارسی و تقویم شمسی نمایش یا دریافت می‌شوند.
لایه Persistence زمان‌ها را به شکل استاندارد قابل محاسبه نگهداری می‌کند تا مرتب‌سازی، SLA و
گزارش‌گیری دچار خطا نشوند.

## تست و کنترل کیفیت

```powershell
npm run lint
npm run typecheck
npm run test:ci
npx prisma validate
npm run build
```

اجرای تمام کنترل‌های نسخه دمو:

```powershell
npm run verify:demo
```

تست مرورگر:

```powershell
npx playwright install chromium
npm run test:e2e
```

GitHub Actions نیز روی Push و Pull Request، دیتابیس MySQL موقت می‌سازد، Bootstrap و Seed
را بررسی می‌کند و سپس Lint، TypeScript، تست‌ها، Prisma و Build را اجرا می‌کند.

## ساختار پروژه

```text
src/app/                 صفحات و Route Handlerهای Next.js
src/components/          کامپوننت‌های عمومی، مشتری، گزارش و Workspace
src/modules/             منطق دامنه و Application Serviceها
src/lib/                 امنیت، احراز هویت، فایل، تاریخ و زیرساخت
src/config/              تعریف حساب‌های دمو
src/__tests__/           تست‌های واحد، API، کامپوننت و قرارداد دیتابیس
prisma/schema.prisma     منبع اصلی schema دیتابیس
scripts/                 Bootstrap، Seed، Scheduler و Smoke Testها
docs/                    مستندات معماری، محصول، SLA و انتشار
e2e/                     سناریوهای Playwright
```

## رفع خطاهای رایج

### «مبدأ درخواست معتبر نیست»

مقدار `APP_ORIGIN` باید دقیقاً شامل Protocol، Host و Port مرورگر باشد. پس از تغییر `.env`
برنامه را Restart کنید.

### «فضای کاری یافت نشد»

Seed ناقص است یا حساب مربوطه نقش و عضویت تیمی ندارد:

```powershell
npm run db:bootstrap-demo
```

### داشبورد مدیریتی خالی است

```powershell
npm run verify:reporting-demo-data
npm run scheduler:maintenance
```

### خطای نوشتن فایل

وجود مسیر `ATTACHMENT_LOCAL_STORAGE_PATH` و مجوز نوشتن Process برنامه را بررسی کنید.
فایل‌های واقعی در Git نگهداری نمی‌شوند.

## امنیت و محدودیت نسخه دمو

- فایل `.env`، داده MySQL و فایل‌های آپلودشده نباید Commit شوند؛
- رمز حساب‌های دمو عمومی و فقط برای ارائه است؛
- حالت HTTP و اسکن غیرفعال فایل صرفاً برای شبکه داخلی دمو در نظر گرفته شده‌اند؛
- برای داده واقعی باید HTTPS، Secretهای تصادفی، Object Storage خصوصی، اسکن بدافزار و
  Migration افزایشی مستقل طراحی شود.

## مجوز

در حال حاضر مجوز Open Source مستقلی برای این مخزن تعریف نشده است؛ تمام حقوق پروژه متعلق به
مالک مخزن است.
