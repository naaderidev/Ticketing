# Event Catalog دامنه پشتیبانی

وضعیت: Approved architecture contract — `R1-v1`

## سه نوع رکورد مستقل

| نوع | هدف | قابل نمایش به کاربر | Retention |
| --- | --- | --- | --- |
| TicketEvent | تاریخچه کسب‌وکاری و ساخت Timeline/KPI | فقط subset عمومی | مطابق Ticket retention |
| AuditEvent | شواهد امنیتی مشاهده و تغییر حساس | معمولاً خیر | مطابق Security/Legal |
| OutboxEvent | تحویل مطمئن Notification/Projection | خیر | کوتاه‌تر پس از تحویل |

## Event envelope

```json
{
  "eventId": "uuid",
  "eventType": "ticket.created.v1",
  "aggregateType": "ticket",
  "aggregateId": "TK-...",
  "aggregateVersion": 1,
  "schemaVersion": 1,
  "occurredAt": "2026-09-13T00:00:00.000Z",
  "actor": {
    "type": "USER|STAFF|SYSTEM",
    "id": "internal-id-or-null"
  },
  "sourceType": "HUMAN|AUTOMATION|MIGRATION",
  "scope": {
    "partyId": "id",
    "organizationId": "id-or-null"
  },
  "correlationId": "request-id",
  "causationId": "command-or-event-id",
  "payload": {
    "fromStatus": "NEW",
    "toStatus": "UNASSIGNED",
    "dimensions": {},
    "attributes": {}
  }
}
```

Payload نباید متن کامل پیام، فایل، کدملی، موبایل، token، مبلغ حساس یا داده‌ای را که برای
Consumer لازم نیست حمل کند. Consumer برای جزئیات مجاز از Query contract خود استفاده می‌کند.

- `actorType` هویت نقش انجام‌دهنده را نگه می‌دارد؛ `sourceType` منشأ اثر را مشخص می‌کند.
- پاسخ اول KPI فقط پیام عمومی با `actorType=STAFF` و `sourceType=HUMAN` است.
- Snapshot غیرحساس Service، Request Type، Team، Queue، Owner، Priority و SLA Policy در
  `payload.dimensions` قرار می‌گیرد و نام/کد را در زمان Event ثابت می‌کند.
- Eventهای قبل از Migration فاز KPI-2 دارای `aggregateVersion=null` و
  `snapshotStatus=HISTORICAL_INCOMPLETE` هستند؛ Reporting حق حدس‌زدن Snapshot تاریخی را ندارد.

## رویدادهای Ticketing

| Event | زمان ثبت | مصرف‌کننده اصلی |
| --- | --- | --- |
| `ticket.imported.v1` | ورود کنترل‌شده رکورد Legacy | Data Quality، Reporting |
| `ticket.created.v1` | Ticket، Team، Policy و SLA commit شدند | Notification، Reporting |
| `ticket.routed.v1` | تصمیم Rule/Team ثبت شد | Timeline داخلی، Reporting |
| `ticket.assigned.v1` | Owner تغییر کرد | Notification، workload projection |
| `ticket.transferred.v1` | Team/Queue تغییر کرد | Notification، SLA، Reporting |
| `ticket.priority_changed.v1` | Priority با دلیل تغییر کرد | SLA، Audit، Reporting |
| `ticket.status_changed.v1` | Transition معتبر commit شد | Timeline، Notification، KPI |
| `ticket.public_message_added.v1` | پیام عمومی و فایل‌ها commit شدند | Notification، first-response KPI |
| `ticket.internal_note_added.v1` | یادداشت داخلی commit شد | Workspace only projection |
| `ticket.customer_input_requested.v1` | وارد WAITING_USER شد | SLA pause، Notification |
| `ticket.customer_replied.v1` | پاسخ کاربر در WAITING_USER رسید | SLA resume، Assignment alert |
| `ticket.resolved.v1` | نتیجه و Root Cause ثبت شدند | Notification، KPI |
| `ticket.resolution_confirmed.v1` | کاربر نتیجه را پذیرفت | Close command، CSAT |
| `ticket.resolution_rejected.v1` | کاربر نتیجه را رد کرد | Reopen، Notification |
| `ticket.closed.v1` | بسته شدن دستی معتبر یا timeout | Reporting، Retention schedule |
| `ticket.reopened.v1` | بازگشایی معتبر commit شد | SLA، Notification، KPI |
| `ticket.rated.v1` | Rating معتبر یک‌بار ثبت شد | CSAT، Reporting |
| `ticket.business_reference_linked.v1` | Reference معتبر متصل شد | Timeline داخلی، Reporting |
| `ticket.collaborator_added.v1` | همکاری داخلی ایجاد شد | Workspace notification |
| `ticket.collaboration_completed.v1` | نتیجه Work Item ثبت شد | Workspace، بازگشت وضعیت |
| `ticket.collaboration_cancelled.v1` | Work Item با دلیل لغو شد | Workspace، بازگشت وضعیت |
| `ticket.resolution_reminder.v1` | یادآوری تأیید نتیجه ثبت شد | Customer notification |

## رویدادهای SLA و Routing

| Event | کاربرد |
| --- | --- |
| `sla.started.v1` | Snapshot Policy و deadlineها ثبت شدند |
| `sla.paused.v1` | Pause با reason و شروع ثبت شد |
| `sla.resumed.v1` | مدت Pause نهایی و deadline به‌روز شد |
| `sla.warning_reached.v1` | آستانه ۷۰٪ یا ۹۰٪ یک‌بار عبور کرد |
| `sla.breached.v1` | deadline پاسخ اول یا حل نقض شد |
| `sla.escalated.v1` | سطح Supervisor/Manager ثبت شد |
| `routing.overridden.v1` | تصمیم Rule توسط Actor مجاز با دلیل تغییر کرد |

## رویدادهای Organization و Approval

| Event | کاربرد |
| --- | --- |
| `organization.membership_created.v1` | عضویت جدید ایجاد شد |
| `organization.membership_scope_changed.v1` | Scope یا اعتبار تغییر کرد |
| `organization.membership_revoked.v1` | دسترسی لغو شد و Session/Context بازبینی می‌شود |
| `approval.requested.v1` | تغییر حساس درخواست شد |
| `approval.approved.v1` | Approver مجاز تأیید کرد |
| `approval.rejected.v1` | درخواست با دلیل رد شد |
| `approval.executed.v1` | تغییر خارجی/داخلی با idempotency اجرا شد |

## رویدادهای Knowledge و Notification

| Event | کاربرد |
| --- | --- |
| `knowledge.article_published.v1` | نسخه Approved قابل جست‌وجو شد |
| `knowledge.article_archived.v1` | نسخه از نتایج فعال خارج شد |
| `notification.requested.v1` | Deliveryهای لازم ساخته شوند |
| `notification.delivery_succeeded.v1` | تحویل provider ثبت شد |
| `notification.delivery_failed.v1` | failure/retry/DLQ ثبت شد |

## قواعد Versioning

- تغییر backward-compatible payload در همان `.v1` فقط با optional field مجاز است.
- حذف، تغییر معنی یا اجباری شدن field نیازمند `.v2` است.
- Consumer باید eventهای ناشناخته را reject امن یا ignore کنترل‌شده کند، نه crash loop.
- Event producer و schema test در یک Release تغییر می‌کنند.
- Event type در کد به‌صورت string آزاد در نقاط مختلف ساخته نمی‌شود؛ catalog typed مرکزی دارد.

## سازگاری نام‌های تاریخی

Producer فقط نام canonical تولید می‌کند. Consumer در Replay سه Alias تاریخی زیر را به‌صورت
کنترل‌شده می‌پذیرد و Event ناشناخته را بدون crash-loop نادیده می‌گیرد:

| Alias تاریخی | نام canonical |
| --- | --- |
| `ticket.staff_replied.v1` | `ticket.public_message_added.v1` با Actor کارشناس |
| `ticket.closed_legacy.v1` | `ticket.closed.v1` |
| `ticket.reopened_legacy.v1` | `ticket.reopened.v1` |

## ترتیب، تکرار و Replay

- ترتیب سراسری تضمین نمی‌شود؛ `aggregateVersion` ترتیب هر Ticket را مشخص می‌کند.
- Delivery حداقل یک‌بار است؛ Consumer با `eventId` idempotent است.
- gap نسخه Aggregate باعث retry/backfill projection می‌شود.
- Replay Outbox نباید Notification تکراری بسازد؛ Delivery دارای idempotency key مستقل است.
- Event business حذف یا update نمی‌شود؛ correction با Event جدید انجام می‌شود.
