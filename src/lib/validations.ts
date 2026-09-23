import { z } from "zod";
import { apiJalaliDateSchema } from "@/lib/jalali-validation";

const requiredTrimmedString = (message: string) => z.string().trim().min(1, message);
const positiveIntegerString = (message: string) => z.string().regex(/^[1-9]\d*$/, message);
const positiveInteger = (message: string) => z.number().int(message).positive(message);
const jalaliDateString = apiJalaliDateSchema;

export const attachmentSchema = z.object({
  uploadId: z.uuid("شناسه فایل معتبر نیست"),
}).strict();

export const loginSchema = z.object({
  mobile: z.string().trim().min(1, "شماره موبایل الزامی است").regex(/^09\d{9}$/, "شماره موبایل معتبر نیست (مثال: 09121234567)"),
  password: z.string().min(1, "رمز عبور الزامی است").max(200),
}).strict();

export const createUserSchema = z.object({
  firstName: requiredTrimmedString("نام الزامی است").max(50, "نام نباید بیشتر از 50 کاراکتر باشد").regex(/^[\u0600-\u06FF\s]+$/, "نام باید فقط با حروف فارسی وارد شود"),
  lastName: requiredTrimmedString("نام خانوادگی الزامی است").max(50, "نام خانوادگی نباید بیشتر از 50 کاراکتر باشد").regex(/^[\u0600-\u06FF\s]+$/, "نام خانوادگی باید فقط با حروف فارسی وارد شود"),
  nationalCode: z.string().trim().regex(/^\d{10}$/, "کد ملی باید 10 رقم باشد (مثال: 0372256985)"),
  mobile: z.string().trim().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست (مثال: 09193574545)"),
  password: z.string().min(6, "رمز عبور باید حداقل 6 کاراکتر باشد").max(200),
  confirmPassword: z.string().min(1, "تکرار رمز عبور الزامی است").max(200),
  email: z.string().trim().min(1, "ایمیل الزامی است").email("فرمت ایمیل معتبر نیست (مثال: example@domain.com)").max(254),
  birthday: jalaliDateString("تاریخ تولد معتبر نیست"),
}).strict().refine((data) => data.password === data.confirmPassword, {
  message: "رمز عبور و تکرار آن یکسان نیستند",
  path: ["confirmPassword"],
});

export const createTicketSchema = z.object({
  subject: requiredTrimmedString("عنوان الزامی است").max(200, "عنوان نباید بیشتر از 200 کاراکتر باشد"),
  message: requiredTrimmedString("متن پیام الزامی است").max(1000, "متن پیام نباید بیشتر از 1000 کاراکتر باشد"),
  departmentId: positiveIntegerString("شناسه دپارتمان معتبر نیست"),
  subDepartmentId: positiveIntegerString("شناسه ساب‌دپارتمان معتبر نیست"),
  attachments: z.array(attachmentSchema).max(10, "حداکثر 10 فایل مجاز است").optional(),
  userId: positiveInteger("شناسه کاربر معتبر نیست").optional(),
}).strict();

export const replySchema = z.object({
  message: requiredTrimmedString("پاسخ الزامی است").max(1000, "پاسخ نباید بیشتر از 1000 کاراکتر باشد"),
  attachments: z.array(attachmentSchema).max(10, "حداکثر 10 فایل مجاز است").optional(),
}).strict();

export const ratingSchema = z.object({
  rating: z.number().int().min(1, "امتیاز باید بین 1 تا 5 باشد").max(5, "امتیاز باید بین 1 تا 5 باشد"),
}).strict();

export const updateTicketSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]).optional(),
  departmentId: positiveInteger("شناسه دپارتمان معتبر نیست").optional(),
  subDepartmentId: positiveInteger("شناسه ساب‌دپارتمان معتبر نیست").optional(),
  closedReason: requiredTrimmedString("علت بستن تیکت الزامی است").max(500, "علت نباید بیشتر از 500 کاراکتر باشد").optional(),
}).strict().refine((data) => Object.keys(data).length > 0, "حداقل یک تغییر الزامی است").refine(
  (data) => data.status !== "CLOSED" || Boolean(data.closedReason),
  { message: "برای بستن تیکت ذکر علت الزامی است", path: ["closedReason"] }
).refine(
  (data) => !data.closedReason || data.status === "CLOSED",
  { message: "علت بستن فقط همراه با وضعیت بسته مجاز است", path: ["closedReason"] }
);

export const departmentSchema = z.object({
  name: requiredTrimmedString("نام دپارتمان الزامی است").max(100, "نام نباید بیشتر از 100 کاراکتر باشد"),
}).strict();

export const subDepartmentSchema = z.object({
  name: requiredTrimmedString("نام ساب‌دپارتمان الزامی است").max(100, "نام نباید بیشتر از 100 کاراکتر باشد"),
}).strict();

export const faqSchema = z.object({
  question: requiredTrimmedString("پرسش الزامی است").max(500, "پرسش نباید بیشتر از 500 کاراکتر باشد"),
  answer: requiredTrimmedString("پاسخ الزامی است").max(5000, "پاسخ نباید بیشتر از 5000 کاراکتر باشد"),
  departmentId: positiveIntegerString("شناسه دپارتمان معتبر نیست"),
  subDepartmentId: z.union([positiveIntegerString("شناسه ساب‌دپارتمان معتبر نیست"), z.literal("")]).optional(),
  priority: z.number().int().nonnegative().optional(),
}).strict();

export const updateFaqSchema = z.object({
  question: requiredTrimmedString("پرسش الزامی است").max(500).optional(),
  answer: requiredTrimmedString("پاسخ الزامی است").max(5000).optional(),
  priority: z.number().int().nonnegative().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, "حداقل یک تغییر الزامی است");

export const reorderFaqsSchema = z.object({
  items: z.array(z.object({
    id: positiveInteger("شناسه پرسش معتبر نیست"),
    priority: z.number().int().nonnegative(),
  }).strict()).min(1, "آیتم‌ها الزامی هستند").max(100),
}).strict().refine(
  ({ items }) => new Set(items.map(({ id }) => id)).size === items.length,
  { message: "شناسه آیتم‌ها باید یکتا باشد", path: ["items"] }
).refine(
  ({ items }) => new Set(items.map(({ priority }) => priority)).size === items.length,
  { message: "اولویت آیتم‌ها باید یکتا باشد", path: ["items"] }
);

export const predefinedMessageSchema = z.object({
  title: requiredTrimmedString("عنوان الزامی است").max(100, "عنوان نباید بیشتر از 100 کاراکتر باشد"),
  content: requiredTrimmedString("محتوا الزامی است").max(5000, "محتوا نباید بیشتر از 5000 کاراکتر باشد"),
  shortCode: requiredTrimmedString("شورت‌کد الزامی است").regex(/^[a-zA-Z0-9_]+$/, "شورت‌کد فقط باید شامل حروف انگلیسی، اعداد و زیرخط باشد").max(50, "شورت‌کد نباید بیشتر از 50 کاراکتر باشد"),
  subDepartmentId: positiveInteger("شناسه ساب‌دپارتمان معتبر نیست").optional().nullable(),
}).strict();

export const updatePredefinedMessageSchema = predefinedMessageSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  "حداقل یک تغییر الزامی است"
);

export const updateUserRoleSchema = z.object({
  userId: positiveInteger("شناسه کاربر معتبر نیست"),
  role: z.enum(["USER", "ADMIN"], { error: "نقش معتبر نیست" }),
}).strict();

const optionalQueryText = z.string().trim().min(1).max(200).optional();
const optionalQueryId = positiveIntegerString("شناسه معتبر نیست").optional();

export const ticketQuerySchema = z.object({
  search: optionalQueryText,
  status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED", "all"]).optional(),
  departmentId: optionalQueryId,
  subDepartmentId: optionalQueryId,
  userName: optionalQueryText,
  userId: optionalQueryId,
  dateFrom: jalaliDateString("تاریخ شروع معتبر نیست").optional(),
  dateTo: jalaliDateString("تاریخ پایان معتبر نیست").optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(10),
}).strict();

export const faqQuerySchema = z.object({
  departmentId: z.union([positiveIntegerString("شناسه دپارتمان معتبر نیست"), z.literal("all")]).optional(),
  subDepartmentId: z.union([positiveIntegerString("شناسه ساب‌دپارتمان معتبر نیست"), z.enum(["all", "none"])]).optional(),
}).strict();

export const notificationQuerySchema = z.object({
  unreadOnly: z.enum(["true", "false"]).optional(),
}).strict();

export const emptyQuerySchema = z.object({}).strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type ReplyInput = z.infer<typeof replySchema>;
export type RatingInput = z.infer<typeof ratingSchema>;
export type DepartmentInput = z.infer<typeof departmentSchema>;
export type SubDepartmentInput = z.infer<typeof subDepartmentSchema>;
export type FaqInput = z.infer<typeof faqSchema>;
export type PredefinedMessageInput = z.infer<typeof predefinedMessageSchema>;
