# قرارداد API v2

وضعیت: Approved architecture contract — endpointهای این فایل هنوز پیاده‌سازی نشده‌اند

Base path: `/api/v2`

## اصول مشترک

- تمام Endpointها به‌جز Knowledge عمومی، Login و Health نیازمند Session معتبر هستند.
- Authorization بر Actor و Scope جاری دیتابیس انجام می‌شود.
- ورودی با Zod در Transport boundary validate و normalize می‌شود.
- DTO عمومی از Prisma Model مستقل است.
- تاریخ تقویمی API با قالب شمسی `YYYY/MM/DD` و تاریخ‌وزمان با قالب شمسی
  `YYYY/MM/DD HH:mm:ss` و منطقه زمانی ضمنی `Asia/Tehran` تبادل می‌شود. ورودی ارقام فارسی
  یا انگلیسی را می‌پذیرد و خروجی برای machine-readability با ارقام انگلیسی canonical است؛
  UI همان مقدار را با ارقام فارسی نمایش می‌دهد.
- Timestampهای دیتابیس، رویدادهای دامنه و محاسبات داخلی UTC باقی می‌مانند و فقط در مرز
  Transport به/از قرارداد شمسی تبدیل می‌شوند. در دوره گذار، ورودی ISO-8601 دارای offset
  نیز پذیرفته می‌شود، اما خروجی عمومی همیشه شمسی است.
- Response حساس `Cache-Control: private, no-store` دارد.
- هر Response دارای `x-request-id` است.
- Client-provided userId، role، ownerName، senderType یا organization permission معتبر نیست.

## Response shape

### موفق

```json
{
  "data": {},
  "meta": {
    "requestId": "uuid"
  }
}
```

### فهرست

```json
{
  "data": [],
  "page": {
    "nextCursor": "opaque-or-null",
    "hasMore": false,
    "limit": 25
  },
  "meta": {
    "requestId": "uuid"
  }
}
```

### خطا

```json
{
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "پیام امن و قابل نمایش",
    "details": [],
    "requestId": "uuid"
  }
}
```

`details` فقط برای خطای validation و بدون داده حساس بازگردانده می‌شود.

## HTTP و Error codes

| HTTP | کاربرد | نمونه Code |
| --- | --- | --- |
| 400 | ورودی یا Cursor نامعتبر | INVALID_REQUEST |
| 401 | Session معتبر نیست | UNAUTHENTICATED |
| 403 | Actor به عملیات کلی مجاز نیست | FORBIDDEN |
| 404 | Resource وجود ندارد یا خارج Scope است | NOT_FOUND |
| 409 | State/Version/Idempotency conflict | INVALID_TRANSITION، CONCURRENT_MODIFICATION |
| 413 | Body/File بیش از حد | PAYLOAD_TOO_LARGE |
| 422 | ورودی معتبر ولی Rule دامنه رد شده | BUSINESS_RULE_VIOLATION |
| 428 | شرط Version برای Mutation حساس ارسال نشده | PRECONDITION_REQUIRED |
| 429 | Rate limit | RATE_LIMITED |
| 502 | پاسخ نامعتبر سرویس مرجع | UPSTREAM_INVALID_RESPONSE |
| 503 | Dependency لازم موقتاً در دسترس نیست | DEPENDENCY_UNAVAILABLE |

Exception خام، SQL/Prisma code، stack، token و شناسه حساس نباید در Response باشد.

## Pagination، Filter و Sort

- limit پیش‌فرض ۲۵ و حداکثر ۱۰۰ است.
- Cursor opaque و به Sort وابسته است؛ Client آن را parse یا تولید نمی‌کند.
- Sort پیش‌فرض `updatedAt desc, id desc` است.
- Filterهای مجاز whitelist و typed هستند.
- جست‌وجوی آزاد روی پیام‌های حساس در V1 endpoint عمومی ندارد.
- count دقیق فقط در Endpoint گزارش یا زمانی که Query budget اجازه دهد ارائه می‌شود.

## Idempotency

Header اجباری برای Commandهای مشخص:

```text
Idempotency-Key: <uuid-or-128-char-safe-token>
```

Scope ذخیره‌سازی: `actorId + activePartyId + route + key`.

- payload hash همراه key ذخیره می‌شود.
- تکرار key با payload یکسان همان status/body موفق قبلی را برمی‌گرداند.
- تکرار key با payload متفاوت `409 IDEMPOTENCY_KEY_REUSED` است.
- عملیات در حال اجرا `409 IDEMPOTENCY_IN_PROGRESS` و `Retry-After` محدود می‌دهد.
- key در Log خام ثبت نمی‌شود؛ فقط hash قابل همبستگی مجاز است.

## Concurrency

Ticket DTO Header زیر را دارد:

```text
ETag: W/"ticket-<publicId>-v<version>"
```

Mutation انسانی باید Header زیر را بفرستد:

```text
If-Match: W/"ticket-<publicId>-v<version>"
```

نبود If-Match روی Commandهای حساس `428 PRECONDITION_REQUIRED` و mismatch برابر
`409 CONCURRENT_MODIFICATION` است. Response conflict نسخه جاری و action امن refresh را
بدون افشای داده خارج Scope اعلام می‌کند.

## Context و Party

| Method | Path | هدف |
| --- | --- | --- |
| GET | `/me` | Actor و قابلیت‌های پایه |
| GET | `/me/contexts` | Party/Organization contextهای مجاز |
| POST | `/me/active-context` | انتخاب Context با اعتبارسنجی مجدد سرور |
| GET | `/organizations/{id}/memberships` | فهرست محدود به Scope مدیر مجاز |
| POST | `/organizations/{id}/access-requests` | درخواست تغییر حساس/نمایندگی |
| POST | `/access-requests/{id}/approve` | Approval مجاز و idempotent |
| POST | `/access-requests/{id}/reject` | Reject همراه دلیل |

## Catalog و Knowledge

| Method | Path | هدف |
| --- | --- | --- |
| GET | `/support/catalog` | خدمات و Request Typeهای فعال برای Context |
| GET | `/knowledge/search?q=` | جست‌وجوی مقاله مجاز |
| GET | `/knowledge/articles/{slug}` | مقاله PUBLIC یا scope-protected |
| POST | `/workspace/knowledge/articles` | ساخت Draft توسط نقش مجاز |
| POST | `/workspace/knowledge/articles/{id}/publish` | انتشار نسخه Approved |

## Ticketهای مشتری

| Method | Path | هدف | Idempotency | If-Match |
| --- | --- | --- | --- | --- |
| POST | `/tickets` | ایجاد Ticket از فرم/Conversation | بله | خیر |
| GET | `/tickets` | فهرست Ticketهای Context جاری | خیر | خیر |
| GET | `/tickets/{ticketId}` | جزئیات Customer DTO | خیر | خیر |
| GET | `/tickets/{ticketId}/timeline` | Timeline قابل نمایش به مشتری | خیر | خیر |
| POST | `/tickets/{ticketId}/messages` | پیام عمومی کاربر | بله | بله |
| POST | `/tickets/{ticketId}/confirm-resolution` | تأیید حل | بله | بله |
| POST | `/tickets/{ticketId}/reject-resolution` | رد نتیجه و Reopen | بله | بله |
| POST | `/tickets/{ticketId}/reopen` | بازگشایی Closed در پنجره مجاز | بله | بله |
| POST | `/tickets/{ticketId}/rating` | ثبت رضایت یک‌باره | بله | بله |

Create Ticket حداقل این intentها را می‌پذیرد: Request Type، Subject، Description، Business
Referenceهای انتخابی و upload tokenهای از قبل ثبت‌شده. Actor، Party، Route، Team، Priority،
SLA، status و tracking number در سرور تعیین می‌شوند.

## Workspace کارشناس

| Method | Path | هدف | Idempotency | If-Match |
| --- | --- | --- | --- | --- |
| GET | `/workspace/queues` | صف‌ها و countهای مجاز | خیر | خیر |
| GET | `/workspace/tickets` | فهرست projection با filter | خیر | خیر |
| GET | `/workspace/tickets/{ticketId}` | Workspace DTO | خیر | خیر |
| POST | `/workspace/tickets/{ticketId}/assign` | تخصیص Owner | بله | بله |
| POST | `/workspace/tickets/{ticketId}/transfer` | انتقال Team/Queue همراه دلیل | بله | بله |
| POST | `/workspace/tickets/{ticketId}/public-replies` | پاسخ عمومی | بله | بله |
| POST | `/workspace/tickets/{ticketId}/internal-notes` | یادداشت داخلی | بله | بله |
| POST | `/workspace/tickets/{ticketId}/request-customer-input` | ورود به WAITING_USER | بله | بله |
| POST | `/workspace/tickets/{ticketId}/resolve` | ثبت نتیجه و RESOLVED | بله | بله |
| POST | `/workspace/tickets/{ticketId}/priority-change` | تغییر Priority با دلیل | بله | بله |
| POST | `/workspace/tickets/{ticketId}/collaborators` | افزودن همکار/Work Item | بله | بله |
| POST | `/workspace/tickets/{ticketId}/work-items/{workItemId}/complete` | تکمیل Work Item با نتیجه | بله | بله |
| POST | `/workspace/tickets/{ticketId}/work-items/{workItemId}/cancel` | لغو Work Item با دلیل | بله | بله |

## Attachment contract

- upload ابتدا Pending Upload خصوصی و متعلق به Actor ایجاد می‌کند.
- claim فقط داخل Transaction ایجاد Message/Ticket انجام می‌شود.
- Download مجوز Resource والد را هر بار بررسی می‌کند.
- فایل و metadata خام از URL عمومی قابل دسترسی نیستند.
- Content type اعلامی Client معتبر فرض نمی‌شود.
- سازوکار امن فعلی حفظ و با Party/Organization Scope توسعه داده می‌شود.

## Reporting KPI

| Method | Path | Permission | هدف |
| --- | --- | --- | --- |
| GET | `/reporting/kpis/time-sla?from={JALALI_DATE_TIME}&to={JALALI_DATE_TIME}` | `reporting.kpi.read.global`، `reporting.kpi.read.team` یا `reporting.kpi.audit.read` | زمان پاسخ اول، زمان حل و SLA پاسخ/حل/ترکیبی |
| GET | `/reporting/kpis/quality?from={JALALI_DATE_TIME}&to={JALALI_DATE_TIME}` | `reporting.kpi.read.global`، `reporting.kpi.read.team` یا `reporting.kpi.audit.read` | FCR، بازگشایی هفت‌روزه با منبع رویداد و CSAT با آستانه انتشار |

- بازه اجباری، شمسی و نیمه‌باز `[from,to)` است، با `Asia/Tehran` تفسیر می‌شود و حداکثر
  ۳۶۶ روز را می‌پذیرد.
- `SUPPORT_MANAGER` فقط با Assignment سراسری، `SUPERVISOR` فقط روی Team Assignmentهای
  صریح و `AUDITOR` فقط در حالت Aggregate به خروجی دسترسی دارد.
- `SYSTEM_ADMINISTRATOR` بدون Grant نقش عملیاتی یا Break-glass دسترسی پیش‌فرض ندارد.
- پاسخ شامل `definitionVersion`، `asOf`، `Asia/Tehran`، Scope، Freshness، Data Quality،
  شمار نمونه و دلیل machine-readable مقدار `null` است.
- Durationها میلی‌ثانیه صحیح‌اند؛ P90 با nearest-rank و درصد با Round Half Up تا دو رقم
  اعشار محاسبه می‌شود. Browser هیچ KPI را از Ticket list بازسازی نمی‌کند.
- lag بیش از ۵ دقیقه `STALE` و بیش از ۱۵ دقیقه `UNAVAILABLE` است؛ در حالت unavailable
  مقدار KPI منتشر نمی‌شود.
- پاسخ `private, no-store` است و این Endpoint در Production پشت
  `FEATURE_REPORTING_API_ENABLED` به‌صورت fail-closed rollout می‌شود.

## سازگاری API قدیم

- `/api/tickets` و routeهای فعلی در دوره Dual-run حذف نمی‌شوند.
- Legacy response shape ناگهانی تغییر نمی‌کند.
- Compatibility Adapter وضعیت‌های جدید را تا حد ممکن به OPEN/IN_PROGRESS/CLOSED نگاشت می‌کند.
- عملیات غیرقابل نمایش مانند RESOLVED یا WAITING_USER در UI قدیم حداقل IN_PROGRESS دیده می‌شوند.
- Legacy write پس از فعال شدن State Machine همان Use Case جدید را فراخوانی می‌کند؛ نوشتن مستقیم
  در ستون قدیم ممنوع می‌شود.
- تاریخ حذف API قدیم تنها پس از telemetry، Cutover کامل UI و اعلام deprecation تعیین می‌شود.
