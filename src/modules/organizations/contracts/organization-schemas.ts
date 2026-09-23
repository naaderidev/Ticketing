import { z } from "zod";

const positiveInteger = (message: string) =>
  z.number().int(message).positive(message);

const scopeSchema = z
  .object({
    type: z.enum(["ORGANIZATION", "BRANCH", "CONTRACT", "ASSET"]),
    scopeKey: z
      .string()
      .trim()
      .min(1, "محدوده دسترسی الزامی است")
      .max(191, "محدوده دسترسی بیش از حد طولانی است")
      .regex(
        /^[A-Za-z0-9._:*\-]+$/,
        "محدوده دسترسی فقط می‌تواند شامل حروف انگلیسی، عدد و . _ : * - باشد"
      ),
  })
  .strict();

export const activePartyContextSchema = z
  .object({
    partyId: positiveInteger("شناسه طرف حساب معتبر نیست"),
  })
  .strict();

export const createOrganizationSchema = z
  .object({
    legalName: z
      .string()
      .trim()
      .min(2, "نام حقوقی سازمان الزامی است")
      .max(200, "نام حقوقی سازمان بیش از حد طولانی است"),
    nationalId: z
      .string()
      .trim()
      .regex(/^\d{11}$/, "شناسه ملی شرکت باید ۱۱ رقم باشد")
      .optional(),
    managerUserId: positiveInteger("شناسه مدیر اولیه معتبر نیست"),
  })
  .strict();

export const organizationAccessRequestSchema = z
  .object({
    targetUserId: positiveInteger("شناسه کاربر هدف معتبر نیست"),
    requestType: z.enum([
      "ADD_MEMBERSHIP",
      "CHANGE_ROLE",
      "CHANGE_SCOPE",
      "REVOKE_MEMBERSHIP",
    ]),
    requestedRole: z.enum(["REPRESENTATIVE", "MANAGER"]).optional(),
    scopes: z.array(scopeSchema).max(50, "تعداد محدوده‌های دسترسی مجاز نیست").default([]),
    reason: z
      .string()
      .trim()
      .min(5, "دلیل درخواست باید حداقل ۵ کاراکتر باشد")
      .max(500, "دلیل درخواست بیش از حد طولانی است"),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      ["ADD_MEMBERSHIP", "CHANGE_ROLE"].includes(value.requestType) &&
      !value.requestedRole
    ) {
      context.addIssue({
        code: "custom",
        path: ["requestedRole"],
        message: "نقش درخواستی الزامی است",
      });
    }

    if (
      ["ADD_MEMBERSHIP", "CHANGE_SCOPE"].includes(value.requestType) &&
      value.scopes.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["scopes"],
        message: "حداقل یک محدوده دسترسی الزامی است",
      });
    }

    const uniqueScopes = new Set(
      value.scopes.map((scope) => `${scope.type}:${scope.scopeKey}`)
    );
    if (uniqueScopes.size !== value.scopes.length) {
      context.addIssue({
        code: "custom",
        path: ["scopes"],
        message: "محدوده‌های دسترسی باید یکتا باشند",
      });
    }
  });

export const organizationAccessDecisionSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(5, "دلیل تصمیم باید حداقل ۵ کاراکتر باشد")
      .max(500, "دلیل تصمیم بیش از حد طولانی است"),
  })
  .strict();

export type OrganizationScopeInput = z.infer<typeof scopeSchema>;
export type CreateOrganizationInput = z.infer<
  typeof createOrganizationSchema
>;
export type OrganizationAccessRequestInput = z.infer<
  typeof organizationAccessRequestSchema
>;
