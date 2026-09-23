# فاز KPI-11 — Backfill، تست و آماده‌سازی انتشار

وضعیت: Completed

نسخه قرارداد: `KPI-V1`

## هدف

بازسازی کنترل‌شده read model گزارش‌ها از Outbox، اثبات تطابق آن با منبع و جلوگیری از انتشار
داشبورد در صورت وجود اختلاف. این فاز هیچ داده تراکنشی، Journey یا KPI مصنوعی ایجاد نمی‌کند؛
نبود منبع معتبر در داشبورد همچنان به‌صورت «غیرقابل انتشار» نمایش داده می‌شود، نه صفر.

## قرارداد Backfill

- `backfillReportingProjection` از Cursor فعلی ادامه می‌دهد و اجرای مجدد آن پس از همگام‌شدن
  یک `NOOP` واقعی است.
- `rebuildReportingProjection` فقط برای بازسازی صریح همه Factهای مشتق‌شده است؛ Ticket، Message،
  Attachment، Journey و داده تراکنش را تغییر نمی‌دهد.
- قبل از پاک‌سازی Fact/processed-event، تعداد Eventهای snapshot با
  `REPORTING_REBUILD_MAX_EVENTS` کنترل می‌شود. عبور از سقف قبل از هر حذف Fail می‌شود.
- High-watermark در ابتدای عملیات ثابت می‌شود؛ Eventهای جدید در اجرای incremental بعدی پردازش
  می‌شوند و Rebuild را بی‌انتها نمی‌کنند.
- Batch با `REPORTING_PROJECTION_BATCH_SIZE`، Lease با
  `REPORTING_PROJECTION_LEASE_SECONDS` و فاصله اختیاری batchها با
  `REPORTING_REBUILD_SLEEP_MS` کنترل می‌شود.
- پردازش هر Event و پیشروی Cursor در Transaction انجام می‌شود. اجرای قطع‌شده از checkpoint
  ادامه‌پذیر است و Event تکراری به‌خاطر ledger یکتای `ReportingProcessedEvent` اثر دوباره ندارد.

## Reconciliation و گیت No-Go

گزارش `reconcileReportingProjection` فقط شناسه‌های عملیاتی تجمیعی، Count، وضعیت و کد کنترل
را برمی‌گرداند و شامل نام، موبایل، کدملی، موضوع/متن تیکت یا نام فایل نیست. انتشار Reporting در
صورت هر مورد زیر متوقف می‌شود:

- نبود یا چندگانگی قرارداد فعال KPI؛
- نبود checkpoint، وضعیت غیر `HEALTHY`، failure ثبت‌شده یا Lease فعال؛
- عقب‌بودن Cursor از high-watermark؛
- Event منبع بدون ledger، ledger بدون منبع، یا اختلاف `eventId`؛
- Event اعمال‌شده بدون Fact یا Fact بدون Event اعمال‌شده؛
- Fact/Journey/Signal با نسخه قرارداد اشتباه؛
- Fact ناقص بدون علت exclusion؛
- تیکت native فعال بدون Party، Request Type، Team یا Queue.

نبود Fact سالم، داده ناکافی برای Journey حل خودکار و Provider تراکنش به‌عنوان Warning گزارش می‌شود، چون طبق
قرارداد KPI-0 جعل مخرج یا ساخت داده Production ممنوع است. این Warning مقدار KPI را منتشرپذیر
نمی‌کند اما سلامت Projection مستقل را نیز به‌اشتباه Fail نمی‌کند.

## مسیر اجرای تکرارپذیر

محلی یا روی دیتابیس Disposable/Staging:

```text
npm run test:kpi-r11-reporting-release
```

این فرمان عمداً فقط hostnameهای `localhost`، `127.0.0.1` و `::1` را می‌پذیرد. اجرای Production
باید به‌صورت one-off job همان image/revision مصوب، بعد از backup و قبل از روشن‌کردن
`FEATURE_REPORTING_API_ENABLED` انجام شود. اجرای مستقیم Smoke destructive روی Production مجاز
نیست.

## ترتیب انتشار

1. `FEATURE_REPORTING_PROJECTION_ENABLED=false` و `FEATURE_REPORTING_API_ENABLED=false`؛
2. backup/restore evidence و `prisma migrate deploy`؛
3. اجرای Backfill روی revision مصوب و نگه‌داری artifact بدون PII؛
4. Reconciliation با `ready=true` و صفر blocker؛
5. روشن‌کردن Projection و مشاهده حداقل یک چرخه incremental؛
6. Reconciliation دوباره و کنترل freshness؛
7. روشن‌کردن API گزارش برای cohort داخلی؛
8. کنترل authorization، export، latency و خطا؛
9. rollout داشبورد؛ rollback کاربردی با خاموش‌کردن API/Projection انجام می‌شود و جداول additive
   باقی می‌مانند.

## پوشش تست

- ردکردن Rebuild بزرگ‌تر از سقف و اثبات عدم تغییر Fact، ledger و checkpoint؛
- بازسازی کامل snapshot و تطابق source/processed؛
- کنترل سلامت، failure، lease، نسخه و high-watermark؛
- کنترل relationهای Event/Fact و routing تیکت‌های فعال؛
- اثبات `NOOP` بودن اجرای دوم؛
- اجرای فاز در CI بعد از migration روی MySQL disposable؛
- اضافه‌شدن تنظیمات Projection/Backfill و Feature Flag به قرارداد اجباری انتشار.

## Rollback و Recovery

- اگر Reconciliation blocker دارد، API گزارش روشن نمی‌شود.
- اگر عملیات قطع شود، ابتدا `backfillReportingProjection` برای Resume اجرا می‌شود؛ Rebuild مجدد
  فقط وقتی مجاز است که تعریف KPI عوض شده یا Fact مشتق‌شده غیرقابل اعتماد باشد.
- خاموش‌کردن Feature Flag داده عملیاتی Ticketing را تغییر نمی‌دهد.
- جدول‌های Reporting مشتق‌شده‌اند، اما حذف دستی آن‌ها یا دست‌کاری checkpoint خارج از سرویس
  ممنوع است.
