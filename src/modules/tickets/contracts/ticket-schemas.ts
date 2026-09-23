import { z } from "zod";

const requiredText = (message: string, maximum: number) =>
  z.string().trim().min(1, message).max(maximum, message);

export const ticketBusinessReferenceSchema = z
  .object({
    type: z
      .string()
      .trim()
      .min(2, "نوع مرجع الزامی است")
      .max(64, "نوع مرجع بیش از حد طولانی است")
      .regex(/^[A-Z][A-Z0-9_]*$/, "نوع مرجع معتبر نیست"),
    key: z
      .string()
      .trim()
      .min(1, "کلید مرجع الزامی است")
      .max(191, "کلید مرجع بیش از حد طولانی است")
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "کلید مرجع معتبر نیست"),
  })
  .strict();

export const createTicketV2Schema = z
  .object({
    requestTypeId: z.number().int().positive("شناسه نوع درخواست معتبر نیست"),
    subject: requiredText("عنوان الزامی است", 200),
    description: requiredText("شرح درخواست الزامی است", 5000),
    supportJourneyId: z.uuid("شناسه Journey معتبر نیست").optional(),
    businessReferences: z
      .array(ticketBusinessReferenceSchema)
      .max(10, "حداکثر ۱۰ مرجع کسب‌وکار مجاز است")
      .default([]),
    attachments: z
      .array(z.object({ uploadId: z.uuid("شناسه فایل معتبر نیست") }).strict())
      .max(10, "حداکثر ۱۰ فایل مجاز است")
      .default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const uniqueReferences = new Set(
      value.businessReferences.map((reference) => `${reference.type}:${reference.key}`)
    );
    if (uniqueReferences.size !== value.businessReferences.length) {
      context.addIssue({
        code: "custom",
        path: ["businessReferences"],
        message: "مرجع کسب‌وکار تکراری مجاز نیست",
      });
    }
  });

export const ticketListV2QuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(2000).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    status: z
      .enum([
        "IN_PROGRESS",
        "WAITING_USER",
        "RESOLVED",
        "CLOSED",
      ])
      .optional(),
  })
  .strict();

export const emptyTicketCommandSchema = z.object({}).strict();

export const ticketReasonCommandSchema = z
  .object({
    reason: requiredText("دلیل الزامی است", 500),
  })
  .strict();

export const addTicketMessageSchema = z
  .object({
    message: requiredText("متن پیام الزامی است", 5000),
    attachments: z
      .array(z.object({ uploadId: z.uuid("شناسه فایل معتبر نیست") }).strict())
      .max(10, "حداکثر ۱۰ فایل مجاز است")
      .default([]),
  })
  .strict();

export const rateTicketV2Schema = z
  .object({
    rating: z.number().int().min(1).max(5),
  })
  .strict();

export const ticketTimelineV2QuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(2000).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type CreateTicketV2Input = z.infer<typeof createTicketV2Schema>;
export type TicketListV2Query = z.infer<typeof ticketListV2QuerySchema>;
export type TicketReasonCommand = z.infer<typeof ticketReasonCommandSchema>;
export type AddTicketMessageInput = z.infer<typeof addTicketMessageSchema>;
export type TicketTimelineV2Query = z.infer<
  typeof ticketTimelineV2QuerySchema
>;
