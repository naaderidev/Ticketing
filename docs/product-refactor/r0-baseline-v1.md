# Baseline محصول R0-v1

وضعیت: Approved

تاریخ: 2026-09-13

مرجع تأیید: اعلام صریح مالک پروژه با متن «بسته R0 تأیید است» در Task جاری Codex

## اجزای Baseline

- Scope و اصول دامنه در `phase-r0-product-baseline.md`
- هر ۲۰ تصمیم مصوب در `decision-register.md`
- مقادیر و دلایل تصمیم‌ها در `r0-approval-pack.md`
- Taxonomy، Routing و SLA اولیه در `request-taxonomy-routing-sla.md`
- Journeyها و State Machine در `journeys-and-lifecycle.md`
- نقش‌ها و طبقه‌بندی داده در `access-and-data-classification.md`
- Integrationهای هدف در `integration-inventory.md`
- KPIها در `kpi-definitions.md`
- کنترل‌های ریسک در `risk-register.md`

## نتیجه

- Scope محصول برای ورود به فاز معماری R1 ثابت شد.
- AI از Launch خارج و Incident کامل به V1.1 منتقل شد.
- هسته V1 در همین پروژه و به شکل Modular Monolith توسعه می‌یابد.
- Team از لحظه ثبت الزامی و Owner فردی فقط در UNASSIGNED قابل خالی بودن است.
- مقادیر SLA، Retention و کانال‌ها به‌عنوان Baseline محصول ثبت شدند.
- قرارداد محاسباتی شاخص‌های موفقیت با نسخه مستقل `KPI-V1` در 2026-09-14 تثبیت شد؛ این
  تثبیت به‌تنهایی به معنی پیاده‌سازی Reporting نیست.

## گیت‌های باقی‌مانده پیش از Production

این گیت‌ها مانع شروع طراحی معماری R1 نیستند، اما مانع فعال‌سازی قابلیت وابسته در Production
خواهند بود:

- تأیید Operations و Legal برای تعهد SLA و ساعات واقعی تیم
- تأیید Legal/Compliance برای Retention و Legal Hold
- تأیید Security برای طبقه‌بندی، Masking، Break-glass و Audit مشاهده
- معرفی Owner، Endpoint و Contract هر سرویس مرجع
- انتخاب Provider ایمیل/پیامک و سیاست Consent/Delivery
- انتخاب زیرساخت Production و تکمیل شواهد Go/No-Go موجود

## کنترل تغییر

هر تغییر پس از این Baseline باید با Decision جدید یا اصلاح نسخه‌دار تصمیم موجود ثبت شود.
تغییر بدون تحلیل اثر روی Schema، API، Migration، Permission، SLA، KPI و تست پذیرفته نیست.
