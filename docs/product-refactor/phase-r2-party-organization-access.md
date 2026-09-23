# فاز R2 — Party، Organization و Permission

وضعیت: تکمیل و تأیید Baseline `R2-v1` با مجوز کاربر برای شروع R3

تاریخ: 2026-09-13

پیش‌نیاز: Baseline معماری `R1-v1`

## هدف و مرز فاز

R2 لایه هویت کسب‌وکاری و دسترسی سازمانی را به‌صورت additive به سامانه فعلی اضافه می‌کند.
`User` همچنان Actor ورود است و `Party` هویت فردی یا سازمانی فعال را نمایش می‌دهد. مالکیت
Ticket و APIهای legacy در این فاز تغییر نکرده‌اند و انتقال آن‌ها به Party در R4 انجام می‌شود.

## مدل داده پیاده‌شده

- `Party` و `PersonProfile` با نگاشت یک‌به‌یک User فعلی
- `Organization` و `OrganizationUnit`
- `OrganizationMembership` با نقش نماینده/مدیر، وضعیت و بازه اعتبار
- `OrganizationMembershipScope` برای Organization، Branch، Contract و Asset
- `Role`، `Permission`، `RolePermission` و `UserRoleAssignment`
- `OrganizationAccessRequest` و Scopeهای درخواست برای گردش Maker/Checker
- `Session.activePartyId` برای Context فعال و فیلدهای Party/Organization در `AuditEvent`

نقش legacy `USER/ADMIN` حذف نشده است. ADMINهای فعلی به نقش
`SYSTEM_ADMINISTRATOR` نگاشت شده‌اند و تغییر legacy role نیز Assignment جدید را همگام
می‌کند.

## Migration و Backfill

Migration: `20260913100000_party_organization_access`

- فقط Expand و Backfill است و هیچ Drop/Rename یا بازنویسی Ticket ندارد.
- شناسه User برای Person Party متناظر دوباره استفاده شده تا mapping قطعی و قابل تطبیق باشد.
- Sessionهای موجود به Person Party کاربر متصل شده‌اند.
- نقش‌ها و Permissionهای ثابت seed و ADMINهای legacy backfill شده‌اند.
- migration روی دیتابیس لوکال اعمال و وضعیت Schema با Prisma تأیید شده است.

نتیجه reconciliation دیتابیس لوکال پس از اعمال:

| شاخص | مقدار |
| --- | ---: |
| User | 11 |
| PersonProfile | 11 |
| Party نوع PERSON | 11 |
| Session بدون activePartyId | 0 |
| ADMIN legacy | 2 |
| SYSTEM_ADMINISTRATOR فعال | 2 |

## API v2

تمام پاسخ‌ها envelope نسخه ۲، `requestId` و `Cache-Control: no-store` دارند.

| Method | Path | کاربرد |
| --- | --- | --- |
| GET | `/api/v2/me` | Actor و Context جاری |
| GET | `/api/v2/me/contexts` | Contextهای فردی/سازمانی مجاز |
| POST | `/api/v2/me/active-context` | تغییر Context با بازاعتبارسنجی سرور |
| GET/POST | `/api/v2/organizations` | فهرست Scopeدار و ایجاد سازمان |
| GET | `/api/v2/organizations/{id}/memberships` | اعضا و Scopeهای سازمان مجاز |
| GET/POST | `/api/v2/organizations/{id}/access-requests` | مشاهده/ثبت درخواست حساس |
| POST | `/api/v2/access-requests/{id}/approve` | تأیید و اعمال اتمیک |
| POST | `/api/v2/access-requests/{id}/reject` | رد درخواست همراه دلیل |

## کنترل‌های امنیتی و یکپارچگی

- Organization/Party/User Actor از Session و دیتابیس ساخته می‌شود، نه claimهای Client.
- query فهرست سازمان برای Actor غیرسراسری در سطح دیتابیس به عضویت مدیر معتبر محدود است.
- دسترسی غیرمجاز به سازمان یا درخواست با `404` مخفی می‌شود.
- self-approval حتی برای مدیر سیستم ممنوع است.
- یک درخواست Pending هم‌نوع برای هر Organization/Target با کلید یکتا کنترل می‌شود.
- درخواست، تصمیم و اعمال Membership در Transaction سریال‌پذیر انجام می‌شود.
- حذف یا تنزل آخرین مدیر معتبر سازمان ممنوع است.
- مدیر باید Scope کامل Organization داشته باشد.
- مشاهده Membership/Access Request و تمام mutationهای حساس Audit می‌شوند.
- mutationها rate limit احرازشده دارند.

## رابط کاربری

- انتخاب Context فردی/سازمانی در Header پنل کاربر
- صفحه `/admin/organizations` برای ایجاد سازمان و تعیین مدیر اولیه
- مشاهده اعضا و Scopeها
- ثبت درخواست افزودن/تغییر نقش/تغییر Scope/لغو عضویت
- تأیید یا رد مستقل همراه دلیل تصمیم

## Feature Flag و Rollback

Flag: `FEATURE_ORGANIZATION_CONTEXT_ENABLED`

- Development/Test در نبود مقدار صریح روشن است.
- Production در نبود مقدار صریح خاموش و fail-closed است.
- مقدار نامعتبر باعث خطای تنظیمات می‌شود.
- Rollback عملیاتی با خاموش‌کردن Flag و بازگرداندن نسخه App انجام می‌شود؛ Schema افزوده‌شده
  باقی می‌ماند و به Drop فوری نیاز ندارد.

## شواهد کیفیت

- Prisma schema validation: پاس
- Migration release-contract/integrity: پاس
- TypeScript: پاس
- ESLint با `max-warnings=0`: پاس
- Jest: 46 suite و 294 test پاس
- Next.js production build: پاس
- Next.js MCP/Turbopack compilation issues: صفر
- Runtime صفحه مدیریت و APIهای Context/Organization با نشست موقت و سپس پاک‌سازی آن: پاس
- Browser console/runtime errors: صفر

## معیار خروج

- مدل و migration additive اعمال و reconcile شده است.
- APIهای R2 و UI bootstrap قابل استفاده‌اند.
- Cross-tenant، Context جعلی، self-approval و last-manager guard تست شده‌اند.
- Audit و Feature Flag فعال‌اند.
- API و رفتار legacy شکسته نشده است.
- Scope فاز بعدی می‌تواند روی Catalog/Team/Queue متمرکز بماند.

## موارد عمداً خارج از R2

- اتصال Ticket به Party/Organization و Business Subject: R4
- Team/Queue و Permissionهای پشتیبانی: R3
- Idempotency عمومی Commandها و Ticket ETag: فازهای Command مربوطه
- اتصال واقعی Branch/Contract/Asset به Providerهای مرجع: فاز Integration
