import { z } from "zod";

// ===== User Schemas =====
export const loginSchema = z.object({
  mobile: z
    .string()
    .min(1, "شماره موبایل الزامی است")
    .regex(/^09\d{9}$/, "شماره موبایل معتبر نیست (مثال: 09121234567)"),
});

export const createUserSchema = z.object({
  firstName: z
    .string()
    .min(1, "نام الزامی است")
    .max(50, "نام نباید بیشتر از 50 کاراکتر باشد")
    .regex(/^[\u0600-\u06FF\s]+$/, "نام باید فقط با حروف فارسی وارد شود"),
  lastName: z
    .string()
    .min(1, "نام خانوادگی الزامی است")
    .max(50, "نام خانوادگی نباید بیشتر از 50 کاراکتر باشد")
    .regex(/^[\u0600-\u06FF\s]+$/, "نام خانوادگی باید فقط با حروف فارسی وارد شود"),
  nationalCode: z
    .string()
    .min(1, "کد ملی الزامی است")
    .regex(/^\d{10}$/, "کد ملی باید 10 رقم باشد (مثال: 0372256985)"),
  mobile: z
    .string()
    .min(1, "شماره موبایل الزامی است")
    .regex(/^09\d{9}$/, "شماره موبایل معتبر نیست (مثال: 09193574545)"),
  email: z
    .string()
    .min(1, "ایمیل الزامی است")
    .email("فرمت ایمیل معتبر نیست (مثال: example@domain.com)"),
  birthday: z
    .string()
    .min(1, "تاریخ تولد الزامی است"),
});

// ===== Ticket Schemas =====
export const createTicketSchema = z.object({
  subject: z
    .string()
    .min(1, "عنوان الزامی است")
    .max(200, "عنوان نباید بیشتر از 200 کاراکتر باشد"),
  message: z
    .string()
    .min(1, "متن پیام الزامی است")
    .max(1000, "متن پیام نباید بیشتر از 1000 کاراکتر باشد"),
  departmentId: z.string().min(1, "دپارتمان الزامی است"),
  subDepartmentId: z.string().min(1, "ساب‌دپارتمان الزامی است"),
});

export const replySchema = z.object({
  message: z
    .string()
    .min(1, "پاسخ الزامی است")
    .max(1000, "پاسخ نباید بیشتر از 1000 کاراکتر باشد"),
});

export const ratingSchema = z.object({
  rating: z
    .number()
    .min(1, "امتیاز باید بین 1 تا 5 باشد")
    .max(5, "امتیاز باید بین 1 تا 5 باشد"),
});

export const closeTicketSchema = z.object({
  closedReason: z
    .string()
    .min(1, "علت بستن تیکت الزامی است")
    .max(500, "علت نباید بیشتر از 500 کاراکتر باشد"),
});

export const transferTicketSchema = z.object({
  departmentId: z.string().min(1, "دپارتمان الزامی است"),
  subDepartmentId: z.string().min(1, "ساب‌دپارتمان الزامی است"),
});

// ===== Department Schemas =====
export const departmentSchema = z.object({
  name: z
    .string()
    .min(1, "نام دپارتمان الزامی است")
    .max(100, "نام نباید بیشتر از 100 کاراکتر باشد"),
});

export const subDepartmentSchema = z.object({
  name: z
    .string()
    .min(1, "نام ساب‌دپارتمان الزامی است")
    .max(100, "نام نباید بیشتر از 100 کاراکتر باشد"),
});

// ===== FAQ Schemas =====
export const faqSchema = z.object({
  question: z
    .string()
    .min(1, "پرسش الزامی است")
    .max(500, "پرسش نباید بیشتر از 500 کاراکتر باشد"),
  answer: z
    .string()
    .min(1, "پاسخ الزامی است")
    .max(5000, "پاسخ نباید بیشتر از 5000 کاراکتر باشد"),
  departmentId: z.string().min(1, "دپارتمان الزامی است"),
  subDepartmentId: z.string().optional().or(z.literal("")),
});

// ===== Predefined Message Schemas =====
export const predefinedMessageSchema = z.object({
  title: z
    .string()
    .min(1, "عنوان الزامی است")
    .max(100, "عنوان نباید بیشتر از 100 کاراکتر باشد"),
  content: z
    .string()
    .min(1, "محتوا الزامی است")
    .max(5000, "محتوا نباید بیشتر از 5000 کاراکتر باشد"),
  shortCode: z
    .string()
    .min(1, "شورت‌کد الزامی است")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "شورت‌کد فقط باید شامل حروف انگلیسی، اعداد و زیرخط باشد"
    )
    .max(50, "شورت‌کد نباید بیشتر از 50 کاراکتر باشد"),
  subDepartmentId: z.number().optional().nullable(),
});

// ===== Types =====
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type ReplyInput = z.infer<typeof replySchema>;
export type RatingInput = z.infer<typeof ratingSchema>;
export type CloseTicketInput = z.infer<typeof closeTicketSchema>;
export type TransferTicketInput = z.infer<typeof transferTicketSchema>;
export type DepartmentInput = z.infer<typeof departmentSchema>;
export type SubDepartmentInput = z.infer<typeof subDepartmentSchema>;
export type FaqInput = z.infer<typeof faqSchema>;
export type PredefinedMessageInput = z.infer<typeof predefinedMessageSchema>;
