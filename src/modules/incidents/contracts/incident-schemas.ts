import { z } from "zod";

const requiredText = (message: string, maximum: number) =>
  z.string().trim().min(1, message).max(maximum, message);

export const createIncidentSchema = z.object({
  title: requiredText("عنوان رخداد الزامی است", 200),
  description: requiredText("شرح رخداد الزامی است", 5000),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  sourceType: z.enum(["MANUAL", "RECURRING_SIGNAL", "EXTERNAL_MONITOR"]).default("MANUAL"),
  sourceReference: z.string().trim().max(191).optional(),
  requestTypeId: z.number().int().positive().optional(),
  serviceCode: z.string().trim().max(64).optional(),
  ownerTeamId: z.number().int().positive().optional(),
  impactedPartyIds: z.array(z.number().int().positive()).max(500).default([]),
  linkedTicketIds: z.array(z.string().trim().min(1).max(100)).max(500).default([]),
}).strict();

export const notifyIncidentSchema = z.object({
  message: requiredText("متن اطلاع‌رسانی الزامی است", 2000),
}).strict();

export const resolveIncidentSchema = z.object({
  resolutionSummary: requiredText("شرح رفع رخداد الزامی است", 5000),
}).strict();

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
