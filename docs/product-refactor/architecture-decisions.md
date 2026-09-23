# تصمیم‌های معماری R1

وضعیت: Approved — نسخه `R1-v1`

## ADR-001 — Modular Monolith

**تصمیم:** قابلیت‌های V1 در همین Next.js application و MySQL، با مرز ماژول صریح پیاده شوند.

**دلیل:** زیرساخت امن فعلی قابل استفاده است، تراکنش‌های Ticketing نیاز به سازگاری قوی دارند و
Microservice در این مرحله هزینه عملیاتی و failure mode جدید ایجاد می‌کند.

**رد شده:** بازنویسی کامل، Microservice از روز اول و خرید هسته بدون Pilot.

## ADR-002 — Versioned API Surface

**تصمیم:** API دامنه جدید زیر `/api/v2` ایجاد شود. Routeهای فعلی تا Cutover حفظ و از منطق
مشترک Application استفاده می‌کنند یا با Compatibility Adapter نگاشت می‌شوند.

**دلیل:** تغییر Shape، نقش‌ها و State Machine با API قدیم backward-compatible نیست.

## ADR-003 — Command-oriented Ticket mutations

**تصمیم:** عملیات معنادار مانند assign، resolve، reopen و confirm-resolution Endpoint مستقل
دارند. PATCH عمومی برای نوشتن دلخواه status/team/owner ارائه نمی‌شود.

**دلیل:** Permission، invariant، Audit و Event هر Command متفاوت است.

## ADR-004 — Three histories, not one generic log

**تصمیم:**

- `TicketEvent` تاریخچه کسب‌وکاری قابل بازسازی و نمایش کنترل‌شده است.
- `AuditEvent` شواهد امنیتی و مشاهده/تغییر حساس است.
- `OutboxEvent` تحویل قابل retry به Notification/Projection است.

یک جدول Generic Log جای هر سه را نمی‌گیرد.

## ADR-005 — External data by reference

**تصمیم:** Contract، Invoice، Payment، PowerPlant، Meter و Site با `sourceSystem + externalId`
و Snapshot حداقلی متصل می‌شوند. مقدار جاری از Service owner خوانده می‌شود.

**رد شده:** کپی کامل داده خارجی یا join مستقیم به Database سرویس دیگر.

## ADR-006 — Optimistic concurrency

**تصمیم:** Ticket یک `version` افزایشی دارد. Mutationهای انسانی `If-Match` یا expected version
می‌خواهند و mismatch با `409 CONCURRENT_MODIFICATION` پاسخ داده می‌شود.

**دلیل:** Assignment، reply و close هم‌زمان نباید تغییر یکدیگر را silently overwrite کنند.

## ADR-007 — Idempotency at command boundary

**تصمیم:** Create Ticket، Message، Resolve، Reopen، Assignment، Approval و webhook/Provider
callback برای retry به Idempotency Key نیاز دارند. نتیجه موفق command در Scope کاربر و Route
برای بازه نگه‌داری مصوب قابل replay است.

## ADR-008 — Transactional Outbox without broker dependency

**تصمیم:** Event تحویلی در همان Transaction تغییر دامنه در MySQL ثبت و توسط Job مصرف شود.
Message Broker در V1 پیش‌نیاز نیست و در صورت نیاز بعدی Consumer contract ثابت می‌ماند.

## ADR-009 — Authorization Context on the server

**تصمیم:** Actor، Party فعال، Organization و Scope از Session و داده جاری سرور ساخته می‌شوند.
Client فقط intent انتخاب Context را می‌فرستد و نمی‌تواند Permission claim بسازد.

## ADR-010 — Additive migration and forward-fix

**تصمیم:** Migrationها ابتدا Table/Column جدید اضافه می‌کنند؛ Backfill و Cutover جداست. حذف
ساختار قدیم در Release مستقل بعد از دوره تثبیت انجام می‌شود. Rollback اپلیکیشن با Feature Flag
و Image قبلی است و دیتابیس با Forward-fix مدیریت می‌شود، نه Down migration مخرب.
