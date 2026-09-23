import { z } from "zod";

export const EXTERNAL_BUSINESS_SUBJECT_TYPES = [
  "CONTRACT",
  "INVOICE",
  "PAYMENT",
  "SETTLEMENT",
  "POWER_PLANT",
  "METER",
  "SAVING_PROGRAM",
] as const;

export const externalBusinessSubjectTypeSchema = z.enum(
  EXTERNAL_BUSINESS_SUBJECT_TYPES
);

export type ExternalBusinessSubjectType = z.infer<
  typeof externalBusinessSubjectTypeSchema
>;

const externalIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

const providerItemSchema = z
  .object({
    sourceSystem: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(/^[A-Z][A-Z0-9_-]*$/),
    entityType: externalBusinessSubjectTypeSchema,
    externalId: externalIdSchema,
    displayLabel: z.string().trim().min(1).max(200),
    snapshotAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }).optional(),
    sourceVersion: z.string().trim().min(1).max(64).optional(),
    etag: z.string().trim().min(1).max(191).optional(),
    authorized: z.boolean(),
  })
  .strict();

export const providerBusinessReferenceResponseSchema = z
  .object({
    contractVersion: z.string().trim().min(1).max(32),
    contextToken: z.string().length(64).regex(/^[a-f0-9]+$/),
    subjectType: externalBusinessSubjectTypeSchema,
    items: z.array(providerItemSchema).max(100),
  })
  .strict();

export const businessReferenceSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2, "حداقل دو نویسه وارد کنید").max(100),
    limit: z.coerce.number().int().min(1).max(25).default(10),
  })
  .strict();

export type BusinessReferenceSearchQuery = z.infer<
  typeof businessReferenceSearchQuerySchema
>;

export type ProviderBusinessReference = z.infer<typeof providerItemSchema>;

export function isExternalBusinessSubjectType(
  value: string | null
): value is ExternalBusinessSubjectType {
  return externalBusinessSubjectTypeSchema.safeParse(value).success;
}
