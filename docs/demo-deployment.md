# انتشار نسخه دمو روی 172.20.40.214:3009

این استقرار عمداً برای ارائه داخلی طراحی شده است. محیط development و production با
`DEMO_MODE=true` از یک قرارداد قابلیت، یک schema و یک Seed استفاده می‌کنند. در این حالت
HTTP مجاز است، کوکی نشست روی HTTP کار می‌کند، ذخیره‌سازی فایل محلی است و سرویس مرجع
کسب‌وکار از Provider نمایشی استفاده می‌کند. بررسی مبدأ درخواست همچنان فعال است و فقط
`APP_ORIGIN` دقیق پذیرفته می‌شود.

## پیش‌نیاز میزبان

- Docker با Compose v2؛
- آزاد بودن TCP پورت 3009 در Windows Firewall؛
- دسترسی نوشتن Docker به Volumeهای محلی.

## انتشار

پروژه را روی میزبان `172.20.40.214` کپی کنید و در PowerShell از ریشه پروژه اجرا کنید:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-demo.ps1
```

فرمان فوق MySQL، bootstrap دیتابیس، برنامه و scheduler را بالا می‌آورد. Bootstrap در اولین
استقرار schema را با `prisma db push --force-reset` می‌سازد و سپس دقیقاً ۱۲ حساب نقش‌دار،
سازمان‌ها، دسترسی‌ها، تیکت‌ها، SLA، اعلان‌ها، دانش و داده‌های KPI را Seed می‌کند. هیچ
فایل migration در پروژه وجود ندارد.

آدرس‌های کنترل:

- برنامه: `http://172.20.40.214:3009`
- زنده بودن: `http://172.20.40.214:3009/api/health/live`
- آمادگی کامل: `http://172.20.40.214:3009/api/health/ready`

برای مشاهده وضعیت:

```powershell
docker compose --env-file .env.demo.example -f compose.demo.yml ps
docker compose --env-file .env.demo.example -f compose.demo.yml logs --tail 200 app scheduler
```

## بازسازی عمدی داده نمایشی

این عملیات همه داده‌های دیتابیس دمو را پاک می‌کند و Seed را از نو می‌سازد:

```powershell
docker compose --env-file .env.demo.example -f compose.demo.yml run --rm bootstrap
docker compose --env-file .env.demo.example -f compose.demo.yml restart app scheduler
```

گارد reset فقط با `DEMO_MODE=true`، کلید `ALLOW_DEMO_DATABASE_RESET=true`، نام دقیق
دیتابیس و عبارت تأیید داخلی اجرا می‌شود تا به دیتابیس دیگری آسیب نرسد.

## اجرای محلی با همان رفتار

برای development نیز همان متغیرهای `.env.demo.example` را استفاده کنید؛ فقط `DATABASE_URL`
را متناسب با MySQL محلی تنظیم کنید. سپس:

```powershell
npm run db:bootstrap-demo
npm run dev:demo
```

هر دو اجرا همان feature flagها، Provider دمو، حساب‌ها و قرارداد API را دارند. تفاوت
`NODE_ENV` صرفاً به بهینه‌سازی build مربوط است، نه قابلیت‌های قابل ارائه.
