# نقشه Migration و Rollout معماری جدید

وضعیت: Approved architecture contract — اجرای Migration در R1 انجام نشده است

## اصل کلی

گذار به مدل جدید به روش Expand and Contract انجام می‌شود. هر Release باید با Schema قبلی و
نسخه اپلیکیشن قبلی در محدوده تعریف‌شده سازگار باشد. Migration مخرب، rename یک‌مرحله‌ای و
تبدیل درجا روی جدول پرترافیک پذیرفته نیست.

## مراحل گذار

### 1. Expand

- افزودن Table، Column و Index جدید به‌صورت nullable یا با default امن
- عدم حذف یا تغییر معنی ستون فعلی
- افزودن mapping table برای Legacy IDها در صورت نیاز
- اندازه‌گیری مدت Migration و lock روی Snapshot پاک‌سازی‌شده
- Deploy اپلیکیشنی که وجود یا نبود داده backfill‌شده را تحمل کند

### 2. Backfill

- پردازش batch، restartable و idempotent
- ثبت cursor/checkpoint، تعداد موفق، skipped، conflict و failure
- محدود کردن batch و sleep توسط configuration، نه مقدار پنهان
- عدم حدس هویت، وضعیت یا mapping نامطمئن
- انتقال رکورد نامطمئن به reconciliation queue
- کنترل Count، relation، uniqueness و نمونه hash‌شده

### 3. Shadow Read

- تولید DTO قدیم و جدید برای درخواست‌های منتخب بدون تغییر پاسخ کاربر
- مقایسه state mapping، ownership و count
- ثبت اختلاف بدون PII
- تعیین tolerance صفر برای Authorization و ownership؛ tolerance مصوب برای فیلد نمایشی

### 4. Dual Write کنترل‌شده

- فقط Application Use Case مشترک می‌تواند مدل قدیم و جدید را بنویسد.
- Dual write در یک transaction دیتابیس است؛ دو Service مستقل با eventual repair استفاده نمی‌شود.
- legacy route مستقیماً Prisma Model قدیم را mutate نمی‌کند.
- خطای write دوم کل command را fail می‌کند و retry با Idempotency امن است.

### 5. Pilot و Canary

- فعال‌سازی Workspace جدید برای یک تیم داخلی
- فعال‌سازی Customer UI برای مجموعه کوچک و قابل بازگشت
- مقایسه SLA، خطا، latency، ticket count و notification delivery
- توقف خودکار/دستی در breach معیارهای No-Go

### 6. Cutover

- API v2 و UI جدید مسیر اصلی می‌شوند.
- legacy routes فقط compatibility read/write محدود ارائه می‌کنند.
- telemetry مصرف API قدیم و خطاهای mapping پایش می‌شود.
- پس از observation window و صفر شدن مصرف، deprecation اعلام می‌شود.

### 7. Contract

- حذف ستون/Table/Route قدیم فقط در Release مستقل
- backup و restore rehearsal تازه
- تأیید نبود consumer قدیمی
- forward-fix plan و image rollback آماده
- Prisma migration شامل Drop باید به‌صورت استثنای بررسی‌شده و پس از Cutover کامل باشد

## نگاشت Legacy پیشنهادی

| منبع فعلی | مقصد جدید | قاعده |
| --- | --- | --- |
| User(USER) | User + Party(PERSON) | حفظ User ID در mapping؛ Party جدید canonical |
| User(ADMIN) | User + staff role assignment | ADMIN به‌صورت خودکار Agent همه تیم‌ها نمی‌شود |
| Department | SupportTeam یا Queue | mapping دستی مصوب، نه تطبیق صرف نام |
| SubDepartment | RequestType | mapping دستی؛ موارد چندمعنا به reconciliation |
| Ticket.userId | createdBy + Party | userId معتبر به Person Party متصل شود |
| Ticket.userName | legacy actor snapshot | هویت authoritative نیست |
| Ticket.message | اولین public TicketMessage | timestamp برابر createdAt قدیم |
| TicketReply | public TicketMessage | senderName snapshot؛ actorId در صورت قابل اثبات بودن |
| OPEN | NEW یا IN_PROGRESS | بر اساس وجود reply/assignment قابل اثبات؛ موارد مبهم review |
| IN_PROGRESS | IN_PROGRESS | Team mapping و SLA legacy flag لازم است |
| CLOSED | CLOSED_LEGACY mapping | resolved history جعل نشود |
| FAQ | KnowledgeArticle Draft | انتشار خودکار ممنوع |
| PredefinedMessage | ResponseTemplate Draft | approval/version پس از review |
| Notification | In-app legacy delivery | channel و status legacy ثبت شود |
| TicketAttachment | Attachment relation جدید | object key/checksum حفظ و authorization والد بازسازی شود |
| AuditEvent | AuditEvent موجود | immutable؛ rewrite یا merge نشود |

## Feature Flagها

| Flag | Scope | Default | Rollback effect |
| --- | --- | --- | --- |
| `support_v2_read` | user/cohort | off | بازگشت به DTO/UI قدیم |
| `support_v2_write` | user/cohort | off | توقف command جدید؛ legacy مشترک باقی می‌ماند |
| `organization_context` | organization/cohort | off | Party فردی پیش‌فرض و B2B غیرفعال |
| `agent_workspace_v2` | team/user | off | بازگشت کارشناس به admin فعلی |
| `customer_experience_v2` | customer cohort/environment | off | بازگشت فوری مسیرهای کاربر به UI و API legacy |
| `sla_enforcement` | request type | observe-only | Deadline ثبت می‌شود ولی escalation اجرایی متوقف است |
| `outbound_email` | environment/event | off | اعلان داخل اپ باقی می‌ماند |
| `public_knowledge` | environment | off | دانش فقط authenticated |

Flagهای امنیتی مجوز را اعطا نمی‌کنند. خاموش کردن UI، endpoint را public یا مجاز نمی‌کند.

## Compatibility mapping وضعیت

| وضعیت جدید | نمایش legacy |
| --- | --- |
| NEW | OPEN |
| UNASSIGNED | OPEN |
| IN_PROGRESS | IN_PROGRESS |
| INTERNAL_REFERRAL | IN_PROGRESS |
| WAITING_INTERNAL | IN_PROGRESS |
| WAITING_USER | IN_PROGRESS |
| RESOLVED | IN_PROGRESS |
| CLOSED | CLOSED |
| REOPENED | IN_PROGRESS |

Legacy endpoint اجازه Command ناسازگار با State Machine را ندارد؛ فقط نمایش آن ساده‌شده است.

## Reconciliation و شواهد

هر Backfill باید این گزارش‌ها را تولید کند:

- total source / migrated / skipped / conflict / failed
- orphan User، Ticket، Reply و Attachment
- Department/SubDepartment بدون mapping
- Ticket بدون Party یا Team
- checksum یا storage reference نامعتبر
- اختلاف وضعیت/نسخه در Shadow Read
- زمان، batch size، DB load و lock duration

گزارش نباید نام، موبایل، کدملی، متن تیکت یا نام فایل را در CI artifact قرار دهد.

## No-Goها

- هر Cross-tenant discrepancy
- Ticket فعال بدون Team معتبر
- lost Message/Attachment یا اختلاف Count بدون توضیح
- Migration غیرقابل resume یا فاقد checkpoint
- lock بیشتر از window مصوب
- خطای authorization در compatibility adapter
- عدم امکان rollback اپلیکیشن با Schema expanded
- نبود backup/restore evidence تازه

## ترتیب فازهای وابسته

- R2: Party/Organization و Permission
- R3: Catalog/Team/Queue
- R4: Ticket core و State Machine
- R5: SLA/Routing
- سپس Integration، UX، Workspace و lifecycle

هر فاز Migration مستقل، backfill مستقل، feature flag و معیار reconciliation خود را دارد.
