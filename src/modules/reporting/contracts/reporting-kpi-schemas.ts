import { z } from "zod";
import { externalBusinessSubjectTypeSchema } from "@/modules/business-references/contracts/business-reference-contracts";
import {
  isReportingLocalMidnight,
  nextCalendarDate,
  reportingLocalDate,
} from "@/modules/reporting/domain/reporting-local-date";
import { apiDateTimeSchema } from "@/lib/jalali-validation";
import { normalizeJalaliDate, parseJalaliDateTime } from "@/lib/jalali-date";

const MAXIMUM_REPORT_RANGE_MILLISECONDS = 366 * 24 * 60 * 60 * 1_000;
const reportingBoundarySchema = apiDateTimeSchema(
  "مرز گزارش باید یک تاریخ شمسی معتبر باشد"
);

const reportingLocalDateSchema = z.string().trim().transform((value, context) => {
  const jalali = normalizeJalaliDate(value);
  if (jalali) return reportingLocalDate(parseJalaliDateTime(jalali)!);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  context.addIssue({ code: "custom", message: "تاریخ محلی باید شمسی و معتبر باشد" });
  return z.NEVER;
});

export const reportingRangeQuerySchema = z
  .object({
    from: reportingBoundarySchema,
    to: reportingBoundarySchema,
  })
  .strict()
  .superRefine((value, context) => {
    const { from, to } = value;
    if (from >= to) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "پایان بازه باید بعد از شروع بازه باشد",
      });
      return;
    }
    if (to.getTime() - from.getTime() > MAXIMUM_REPORT_RANGE_MILLISECONDS) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "بازه گزارش نمی‌تواند بیشتر از ۳۶۶ روز باشد",
      });
    }
  });

export const timeSlaReportQuerySchema = reportingRangeQuerySchema;

export type ReportingRangeQuery = z.output<typeof reportingRangeQuerySchema>;
export type TimeSlaReportQuery = ReportingRangeQuery;

export const recurringProblemsReportQuerySchema = z
  .object({
    from: reportingBoundarySchema,
    to: reportingBoundarySchema,
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .superRefine((value, context) => {
    const { from, to } = value;
    if (from >= to) {
      context.addIssue({ code: "custom", path: ["to"], message: "پایان بازه باید بعد از شروع بازه باشد" });
      return;
    }
    if (to.getTime() - from.getTime() > MAXIMUM_REPORT_RANGE_MILLISECONDS) {
      context.addIssue({ code: "custom", path: ["to"], message: "بازه گزارش نمی‌تواند بیشتر از ۳۶۶ روز باشد" });
    }
    if (!isReportingLocalMidnight(from) || !isReportingLocalMidnight(to)) {
      context.addIssue({ code: "custom", path: ["from"], message: "مرزهای گزارش باید نیمه‌شب به وقت Asia/Tehran باشند" });
    }
  });

export type RecurringProblemsReportQuery = z.output<
  typeof recurringProblemsReportQuerySchema
>;

export const recurringProblemDrillDownQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    from: reportingBoundarySchema.optional(),
    to: reportingBoundarySchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasFrom = value.from !== undefined;
    const hasTo = value.to !== undefined;
    if (hasFrom !== hasTo) {
      context.addIssue({
        code: "custom",
        path: hasFrom ? ["to"] : ["from"],
        message: "برای مشاهده جزئیات، ابتدا و انتهای بازه باید با هم ارسال شوند",
      });
      return;
    }
    if (!value.from || !value.to) return;
    if (value.from >= value.to) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "پایان بازه باید بعد از شروع بازه باشد",
      });
      return;
    }
    if (value.to.getTime() - value.from.getTime() > MAXIMUM_REPORT_RANGE_MILLISECONDS) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "بازه گزارش نمی‌تواند بیشتر از ۳۶۶ روز باشد",
      });
    }
    if (!isReportingLocalMidnight(value.from) || !isReportingLocalMidnight(value.to)) {
      context.addIssue({
        code: "custom",
        path: ["from"],
        message: "مرزهای گزارش باید نیمه‌شب به وقت Asia/Tehran باشند",
      });
    }
  });

export type RecurringProblemDrillDownQuery = z.output<
  typeof recurringProblemDrillDownQuerySchema
>;

const providerCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Z][A-Z0-9_-]*$/, "کد منبع تراکنش معتبر نیست");

const organizationIdQuerySchema = z
  .string()
  .regex(/^[1-9]\d*$/, "شناسه سازمان معتبر نیست")
  .transform(Number)
  .refine(Number.isSafeInteger, "شناسه سازمان معتبر نیست");

export const ticketPerTransactionReportQuerySchema = z
  .object({
    from: reportingBoundarySchema,
    to: reportingBoundarySchema,
    providerCode: providerCodeSchema,
    transactionType: externalBusinessSubjectTypeSchema,
    organizationId: organizationIdQuerySchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const { from, to } = value;
    if (from >= to) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "پایان بازه باید بعد از شروع بازه باشد",
      });
      return;
    }
    if (to.getTime() - from.getTime() > MAXIMUM_REPORT_RANGE_MILLISECONDS) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "بازه گزارش نمی‌تواند بیشتر از ۳۶۶ روز باشد",
      });
    }
    if (!isReportingLocalMidnight(from)) {
      context.addIssue({
        code: "custom",
        path: ["from"],
        message: "شروع بازه باید نیمه‌شب به وقت Asia/Tehran باشد",
      });
    }
    if (!isReportingLocalMidnight(to)) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "پایان بازه باید نیمه‌شب به وقت Asia/Tehran باشد",
      });
    }
  });

export type TicketPerTransactionReportQuery = z.output<
  typeof ticketPerTransactionReportQuerySchema
>;

const countSchema = z
  .string()
  .regex(/^\d+$/, "تعداد باید رشته‌ای از رقم‌های نامنفی باشد")
  .refine(
    (value) => BigInt(value) <= BigInt("9223372036854775807"),
    "تعداد از محدوده BIGINT خارج است"
  )
  .transform(BigInt);

const transactionVolumeRowSchema = z
  .object({
    transactionType: externalBusinessSubjectTypeSchema,
    localDate: reportingLocalDateSchema,
    bucketStartedAt: apiDateTimeSchema("شروع سطل باید یک تاریخ شمسی معتبر باشد"),
    bucketEndedAt: apiDateTimeSchema("پایان سطل باید یک تاریخ شمسی معتبر باشد"),
    scopeType: z.enum(["GLOBAL", "ORGANIZATION"]),
    organizationId: z.number().int().positive().optional(),
    successfulTransactionCount: countSchema,
    totalTransactionCount: countSchema.optional(),
    status: z.enum(["PROVISIONAL", "VERIFIED", "REJECTED"]),
  })
  .strict()
  .superRefine((value, context) => {
    const start = value.bucketStartedAt;
    const end = value.bucketEndedAt;
    if (
      !isReportingLocalMidnight(start) ||
      reportingLocalDate(start) !== value.localDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["bucketStartedAt"],
        message: "شروع سطل باید نیمه‌شب تاریخ محلی به وقت Asia/Tehran باشد",
      });
    }
    if (
      !isReportingLocalMidnight(end) ||
      reportingLocalDate(end) !== nextCalendarDate(value.localDate)
    ) {
      context.addIssue({
        code: "custom",
        path: ["bucketEndedAt"],
        message: "پایان سطل باید نیمه‌شب روز بعد به وقت Asia/Tehran باشد",
      });
    }
    if (end <= start) {
      context.addIssue({
        code: "custom",
        path: ["bucketEndedAt"],
        message: "پایان سطل باید بعد از شروع آن باشد",
      });
    }
    if (
      value.totalTransactionCount !== undefined &&
      value.totalTransactionCount < value.successfulTransactionCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["totalTransactionCount"],
        message: "تعداد کل نمی‌تواند کمتر از تعداد تراکنش موفق باشد",
      });
    }
    const validGlobal =
      value.scopeType === "GLOBAL" && value.organizationId === undefined;
    const validOrganization =
      value.scopeType === "ORGANIZATION" && value.organizationId !== undefined;
    if (!validGlobal && !validOrganization) {
      context.addIssue({
        code: "custom",
        path: ["organizationId"],
        message: "شناسه سازمان باید فقط برای scope سازمانی ارسال شود",
      });
    }
  });

export const transactionVolumeBatchSchema = z
  .object({
    providerCode: providerCodeSchema,
    sourceVersion: z.string().trim().min(1).max(64),
    rows: z.array(transactionVolumeRowSchema).min(1).max(366),
  })
  .strict()
  .superRefine((value, context) => {
    const keys = new Set<string>();
    value.rows.forEach((row, index) => {
      const scopeKey = row.organizationId?.toString() ?? "*";
      const key = `${row.transactionType}:${row.localDate}:${row.scopeType}:${scopeKey}`;
      if (keys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["rows", index],
          message: "سطل تکراری در یک بسته مجاز نیست",
        });
      }
      keys.add(key);
    });
  });

export type TransactionVolumeBatch = z.output<typeof transactionVolumeBatchSchema>;
