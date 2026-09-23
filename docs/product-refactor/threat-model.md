# Threat Model محصول پشتیبانی

وضعیت: Approved architecture baseline — باید در هر فاز به‌روزرسانی شود

## دارایی‌های حساس

- Session، هویت فردی، موبایل و کدملی
- عضویت و Scope نماینده شرکت
- قرارداد، فاکتور، پرداخت، مبلغ و اطلاعات حساب
- اطلاعات نیروگاه، کنتور، سایت و دارایی
- متن Ticket، Internal Note، فایل و پاسخ آماده
- تصمیم SLA، Assignment، Approval و Audit
- Credential سرویس‌های مرجع، S3، scanner و provider اعلان

## مرزهای اعتماد

1. Browser/App تا Next.js Route Handler
2. Proxy تا Authentication/Authorization server boundary
3. Next.js تا MySQL
4. Ticketing تا سرویس‌های مرجع برقتو
5. Ticketing تا S3 و malware scanner
6. Outbox worker تا Email/SMS provider
7. Workspace کارکنان تا داده سازمان/کاربر
8. CI/Staging/Production و secret stores

## تهدیدها و کنترل‌ها

| شناسه | تهدید | شدت | کنترل معماری | تست/شاهد الزامی |
| --- | --- | --- | --- | --- |
| T-001 | مشاهده Ticket شرکت دیگر با تغییر ID | Critical | Scope سروری، 404 خارج Scope، query policy | تست Cross-tenant روی list/detail/file/export |
| T-002 | جعل Party/Organization/Role در body | Critical | ساخت Authorization Context از DB؛ ignore client claims | negative API tests |
| T-003 | نشت Internal Note در DTO/Notification | Critical | مدل و mapper جدا، event payload حداقلی | snapshot/schema test و E2E user |
| T-004 | اتصال Contract/Payment متعلق به دیگری | Critical | validate reference از adapter با actor scope | contract test و forged-ID test |
| T-005 | Mass assignment status/team/owner | High | command endpoint و allowlist schema | unknown-field و forbidden-command tests |
| T-006 | Lost update در پاسخ/ارجاع/بستن هم‌زمان | High | version + If-Match + serializable transaction | concurrency integration tests |
| T-007 | replay یا double submit | High | scoped idempotency key و payload hash | duplicate/reused-key tests |
| T-008 | جعل webhook/provider callback | High | signature، timestamp، replay window و allowlist | invalid/replayed signature tests |
| T-009 | SSRF از URL سرویس/فایل | Critical | endpoint config allowlist؛ عدم دریافت URL دلخواه | SSRF negative tests |
| T-010 | فایل آلوده یا polyglot | Critical | private storage، magic-byte inspection، ClamAV fail-closed | EICAR/mismatch/quota tests |
| T-011 | افشای PII در log/event/metric | High | redaction، payload allowlist و structured logger | log capture tests |
| T-012 | سوءاستفاده ادمین یا Support Agent | High | least privilege، team scope، break-glass و view audit | role matrix و audit evidence |
| T-013 | تغییر/حذف تاریخچه | Critical | append-only event/audit policy و DB privilege | mutation denial/reconciliation |
| T-014 | enumeration با search/cursor | High | scoped query، opaque cursor، rate limit | cross-scope pagination tests |
| T-015 | XSS در message/article/template | High | render escaping، sanitize rich text، CSP | stored-XSS tests |
| T-016 | CSRF روی commandها | High | SameSite + origin/CSRF control فعلی | cross-origin mutation tests |
| T-017 | queue starvation و SLA job duplication | High | lease/lock، batch bound، idempotent thresholds | multi-worker job tests |
| T-018 | notification حاوی داده حساس | High | template allowlist، channel classification | payload privacy tests |
| T-019 | cache اشتراکی داده سازمان | Critical | private/no-store و context-aware keys | cache isolation tests |
| T-020 | Query/Export بسیار بزرگ | High | limit، async export، authorization و quotas | load/abuse tests |
| T-021 | dependency outage باعث state ناقص | High | timeout، no network in DB transaction، outbox | fault injection tests |
| T-022 | AI prompt injection یا data exfiltration | Critical | AI off در Launch؛ approved retrieval و tenant filter بعدی | شرط No-Go فاز AI |

## Authorization invariants

- Session معتبر به‌تنهایی مجوز Resource نیست.
- ADMIN فعلی در مدل جدید مجوز سراسری محتوای Ticket نمی‌دهد.
- System Administrator بدون Break-glass محتوای CONFIDENTIAL/RESTRICTED را نمی‌بیند.
- Customer DTO با Workspace DTO type و mapper متفاوت دارد.
- Attachment permission از والد جاری و actor context مشتق می‌شود.
- Organization scope در تمام list queryها اعمال می‌شود، نه filter بعد از fetch.
- Approval actor نمی‌تواند درخواست حساس خود را در موارد dual-control تأیید کند.

## کنترل External Adapter

- URL و credential فقط از configuration معتبر خوانده می‌شوند.
- timeout اجباری و retry فقط برای عملیات safe/idempotent است.
- response با schema محدود validate می‌شود.
- متن خطای upstream به Client یا log عمومی منتقل نمی‌شود.
- circuit breaker فقط برای failure mode اندازه‌گیری‌شده اضافه می‌شود.
- cached data دارای source، fetchedAt، expiry و classification است.

## Privacy و Data minimization

- Event و Outbox فقط شناسه و فیلد لازم Consumer را حمل می‌کنند.
- Search index متن Restricted را بدون تصمیم امنیتی ingest نمی‌کند.
- Analytics از شناسه pseudonymous و dimension مجاز استفاده می‌کند.
- Export دارای expiration، encryption، download audit و row limit است.
- Retention و Legal Hold پیش از job حذف Production تأیید می‌شوند.

## Security gates هر فاز

1. Threat Model delta
2. Authorization matrix delta
3. negative unit/integration tests
4. cross-tenant E2E
5. log/event privacy test
6. migration permission/reconciliation test
7. dependency and secret scan موجود
8. Security owner sign-off برای Critical change

## Incident triggerهای فوری

مشاهده داده شرکت دیگر، نشت Internal Note، فایل بدون مجوز، پاسخ مالی/حقوقی حدسی، Audit gap،
دورزدن Approval یا mismatch گسترده Migration رخداد امنیتی/عملیاتی محسوب و Rollout متوقف
می‌شود.
