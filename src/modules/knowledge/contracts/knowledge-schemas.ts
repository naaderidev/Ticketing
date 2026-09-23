import { z } from "zod";

const requiredText = (message: string, maximum: number) =>
  z.string().trim().min(1, message).max(maximum, message);

const knowledgeKeywordsSchema = z
  .array(requiredText("کلیدواژه نمی‌تواند خالی باشد", 80))
  .max(30, "حداکثر ۳۰ کلیدواژه مجاز است")
  .default([])
  .superRefine((keywords, context) => {
    const normalized = keywords.map((keyword) => keyword.toLocaleLowerCase("fa"));
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({
        code: "custom",
        message: "کلیدواژه تکراری مجاز نیست",
      });
    }
  });

export const createKnowledgeArticleSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(3, "نامک مقاله حداقل سه نویسه است")
      .max(191, "نامک مقاله بیش از حد طولانی است")
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "نامک مقاله معتبر نیست"),
    title: requiredText("عنوان مقاله الزامی است", 500),
    body: requiredText("متن مقاله الزامی است", 20_000),
    keywords: knowledgeKeywordsSchema,
    audience: z.enum(["PUBLIC", "AUTHENTICATED", "ORGANIZATION"]),
    serviceId: z.number().int().positive("شناسه خدمت معتبر نیست").optional(),
    requestTypeId: z
      .number()
      .int()
      .positive("شناسه نوع درخواست معتبر نیست")
      .optional(),
  })
  .strict();

export const updateKnowledgeArticleSchema = z
  .object({
    title: requiredText("عنوان مقاله الزامی است", 500),
    body: requiredText("متن مقاله الزامی است", 20_000),
    keywords: knowledgeKeywordsSchema,
    audience: z.enum(["PUBLIC", "AUTHENTICATED", "ORGANIZATION"]),
    serviceId: z.number().int().positive("شناسه خدمت معتبر نیست").optional(),
    requestTypeId: z
      .number()
      .int()
      .positive("شناسه نوع درخواست معتبر نیست")
      .optional(),
  })
  .strict();

export const publishKnowledgeArticleSchema = z
  .object({
    version: z.number().int().positive("نسخه مقاله معتبر نیست"),
  })
  .strict();

export const startKnowledgeJourneySchema = z
  .object({
    articleId: z.number().int().positive("شناسه مقاله معتبر نیست"),
    question: z
      .string()
      .trim()
      .max(500, "متن سؤال بیش از حد طولانی است")
      .optional(),
  })
  .strict();

export const confirmKnowledgeResolutionSchema = z.object({}).strict();
export const archiveKnowledgeArticleSchema = z.object({}).strict();

export const workspaceKnowledgeArticleQuerySchema = z
  .object({
    q: z.string().trim().max(100, "عبارت جست‌وجو بیش از حد طولانی است").default(""),
    status: z.enum(["ALL", "DRAFT", "ACTIVE", "ARCHIVED"]).default("ALL"),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const customerKnowledgeArticleQuerySchema = z
  .object({
    q: z.string().trim().max(100, "عبارت جست‌وجو بیش از حد طولانی است").default(""),
    limit: z.coerce.number().int().min(1).max(30).default(12),
  })
  .strict();

export type CreateKnowledgeArticleInput = z.infer<
  typeof createKnowledgeArticleSchema
>;
export type PublishKnowledgeArticleInput = z.infer<
  typeof publishKnowledgeArticleSchema
>;
export type UpdateKnowledgeArticleInput = z.infer<
  typeof updateKnowledgeArticleSchema
>;
export type WorkspaceKnowledgeArticleQuery = z.infer<
  typeof workspaceKnowledgeArticleQuerySchema
>;
export type StartKnowledgeJourneyInput = z.infer<
  typeof startKnowledgeJourneySchema
>;
export type CustomerKnowledgeArticleQuery = z.infer<
  typeof customerKnowledgeArticleQuerySchema
>;
