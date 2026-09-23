import { z } from "zod";
import { apiDateTimeSchema } from "@/lib/jalali-validation";

const positiveInteger = (message: string) =>
  z.number().int(message).positive(message);

const catalogCode = z
  .string()
  .trim()
  .min(2, "کد الزامی است")
  .max(64, "کد بیش از حد طولانی است")
  .regex(/^[A-Z][A-Z0-9_]*$/, "کد باید با حروف بزرگ انگلیسی نوشته شود");

const catalogName = z
  .string()
  .trim()
  .min(2, "نام الزامی است")
  .max(150, "نام بیش از حد طولانی است");

const optionalDescription = z
  .string()
  .trim()
  .max(500, "توضیحات بیش از حد طولانی است")
  .optional();

export const createSupportServiceSchema = z
  .object({
    code: catalogCode,
    name: catalogName,
    description: optionalDescription,
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();

export const createSupportTeamSchema = z
  .object({
    code: catalogCode,
    name: catalogName,
    description: optionalDescription,
    defaultQueue: z
      .object({
        code: catalogCode,
        name: catalogName,
        description: optionalDescription,
      })
      .strict(),
  })
  .strict();

export const createSupportRequestTypeSchema = z
  .object({
    serviceId: positiveInteger("شناسه خدمت معتبر نیست"),
    code: catalogCode,
    name: catalogName,
    description: optionalDescription,
    businessSubjectType: z
      .string()
      .trim()
      .max(64, "نوع موضوع کسب‌وکار بیش از حد طولانی است")
      .regex(/^[A-Z][A-Z0-9_]*$/, "نوع موضوع کسب‌وکار معتبر نیست")
      .optional(),
    requiresBusinessSubject: z.boolean().default(false),
    requiresRootCause: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
    queueId: positiveInteger("شناسه صف معتبر نیست"),
    defaultPriority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.requiresBusinessSubject && !value.businessSubjectType) {
      context.addIssue({
        code: "custom",
        path: ["businessSubjectType"],
        message: "نوع موضوع کسب‌وکار برای این درخواست الزامی است",
      });
    }
  });

export const assignSupportTeamMemberSchema = z
  .object({
    userId: positiveInteger("شناسه کاربر معتبر نیست"),
    roleKey: z.enum(["SUPPORT_AGENT", "SUPERVISOR"]),
    validTo: apiDateTimeSchema("پایان اعتبار باید یک تاریخ شمسی معتبر باشد")
      .transform((date) => date.toISOString())
      .optional(),
  })
  .strict();

export const publishSupportRouteSchema = z
  .object({
    queueId: positiveInteger("شناسه صف معتبر نیست"),
    defaultPriority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]),
    reason: z
      .string()
      .trim()
      .min(5, "دلیل تغییر مسیر باید حداقل ۵ کاراکتر باشد")
      .max(500, "دلیل تغییر مسیر بیش از حد طولانی است"),
  })
  .strict();

export const reconcileLegacyCatalogMappingSchema = z
  .object({
    status: z.enum(["MAPPED", "IGNORED", "CONFLICT"]),
    supportServiceId: positiveInteger("شناسه خدمت معتبر نیست").optional(),
    supportRequestTypeId: positiveInteger(
      "شناسه نوع درخواست معتبر نیست"
    ).optional(),
  })
  .strict();

export type CreateSupportServiceInput = z.infer<
  typeof createSupportServiceSchema
>;
export type CreateSupportTeamInput = z.infer<typeof createSupportTeamSchema>;
export type CreateSupportRequestTypeInput = z.infer<
  typeof createSupportRequestTypeSchema
>;
export type AssignSupportTeamMemberInput = z.infer<
  typeof assignSupportTeamMemberSchema
>;
export type PublishSupportRouteInput = z.infer<
  typeof publishSupportRouteSchema
>;
export type ReconcileLegacyCatalogMappingInput = z.infer<
  typeof reconcileLegacyCatalogMappingSchema
>;
