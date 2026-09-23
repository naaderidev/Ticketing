# فاز KPI-6 — زیرساخت حل خودکار

وضعیت: Completed

تاریخ اجرا: 2026-09-15

نسخه قرارداد: `KPI-V1`

Migration: `20260915130000_automated_resolution_infrastructure`

## هدف

ایجاد منبع معتبر و قابل‌ممیزی برای KPI-07، بدون محاسبه‌ی زودهنگام شاخص یا نسبت‌دادن پاسخ
آماده‌ی کارشناس به حل خودکار. یک Journey فقط وقتی واجد شرایط است که نسخه‌ای از محتوای
`PUBLIC + APPROVED + ACTIVE` واقعاً به کاربر نمایش داده شده باشد.

## مدل داده

- `KnowledgeArticle` هویت، نامک، مخاطب، وضعیت، خدمت و نوع درخواست را نگه می‌دارد.
- `KnowledgeArticleVersion` متن immutable هر نسخه، checksum، تأییدکننده و زمان انتشار را
  ثبت می‌کند.
- `SupportJourney` به نسخه دقیق مقاله متصل است و کلیدهای idempotency را فقط به‌صورت HMAC
  نگه می‌دارد.
- شناسه Party در Journey ذخیره نمی‌شود؛ `partyKeyHash` با secret محیط ساخته می‌شود.
- FAQهای Legacy به نسخه Draft با مخاطب `AUTHENTICATED` منتقل می‌شوند و به‌طور خودکار
  منتشر یا وارد جمعیت KPI نمی‌شوند.

## چرخه Journey

1. `POST /api/v2/knowledge/journeys` فقط مقاله عمومی، تأییدشده و فعال را نمایش می‌دهد و
   Journey را مستقیماً در حالت `CONTENT_SHOWN` ثبت می‌کند.
2. `POST /api/v2/knowledge/journeys/{id}/confirm-resolution` تأیید صریح کاربر را ثبت و
   پنجره‌ی تبدیل ۲۴ساعته را آغاز می‌کند.
3. اگر کاربر با همان Journey تیکت بسازد، `supportJourneyId` در فرمان ساخت تیکت داخل همان
   تراکنش اعتبارسنجی و به تیکت متصل می‌شود.
4. Job داخلی `POST /api/internal/reporting/support-journeys/process` تأییدهای بدون تیکت را
   پس از پایان ۲۴ ساعت نهایی می‌کند.

کلید تکرار شروع Journey به Party و کلید تأیید به خود Journey scope شده است. استفاده مجدد
از یک کلید با payload متفاوت رد می‌شود و replay معتبر پاسخ پایدار برمی‌گرداند.

## مدیریت دانش و مجوزها

- `POST /api/v2/workspace/knowledge/articles` یک مقاله و نسخه Draft می‌سازد.
- `POST /api/v2/workspace/knowledge/articles/{id}/publish` نسخه را در یک تراکنش تأیید و
  منتشر می‌کند.
- مجوزهای `knowledge.article.manage` و `knowledge.article.publish` فقط از RoleAssignment
  صریح Global خوانده می‌شوند و به `SUPPORT_MANAGER` و `SYSTEM_ADMINISTRATOR` داده شده‌اند.
- رخداد انتشار مقاله، شروع Journey، تأیید نتیجه، تبدیل به تیکت و نهایی‌شدن outcome در
  Transactional Outbox ثبت می‌شوند.

## ایمنی rollout و rollback

`FEATURE_AUTOMATED_RESOLUTION_ENABLED` در production به‌صورت پیش‌فرض خاموش است و در
`.env.example` و CI نیز مقدار امن `false` دارد. خاموش‌کردن Flag، APIهای Journey و Job را
از دسترس خارج می‌کند؛ migration افزایشی است و برای rollback برنامه نیازی به حذف جدول یا
ستون نیست.

## نتیجه اجرای محلی

| کنترل | نتیجه |
| --- | --- |
| Migration | PASS؛ هر ۳۲ migration اعمال شده و دیتابیس همگام است |
| تبدیل Legacy FAQ | PASS؛ فقط Draft و غیرواجد شرایط KPI |
| تست قرارداد و API | PASS؛ validation سخت‌گیرانه، UUID، idempotency و پاسخ امن |
| تست یکپارچه MySQL | PASS؛ نمایش، replay، تأیید، بلوغ ۲۴ساعته و تبدیل به تیکت |
| رگرسیون کامل Jest | PASS؛ ۹۰ Suite و ۴۷۸ Test، چهار integration opt-in در اجرای عادی skip |
| TypeScript و ESLint | PASS |
| Prisma validate و release contract | PASS |
| Production build | PASS؛ Routeهای جدید در manifest ثبت شدند |
| Runtime Next MCP | PASS؛ compilation issue، config error و session error برابر صفر |

محاسبه و انتشار خود KPI-07، داشبورد مدیریتی و UX نمایش پیشنهاد دانش عمداً در فازهای بعدی
انجام می‌شوند؛ این فاز فقط منبع داده‌ی معتبر و مسیر attribution را تثبیت می‌کند.
