import { z } from "zod";

const requiredText = (message: string, maximum: number) =>
  z.string().trim().min(1, message).max(maximum, message);

const attachmentSchema = z.object({ uploadId: z.uuid("شناسه فایل معتبر نیست") }).strict();

export const workspaceTicketListQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  queueId: z.coerce.number().int().positive().optional(),
  status: z.enum([
    "NEW", "UNASSIGNED", "IN_PROGRESS", "INTERNAL_REFERRAL",
    "WAITING_INTERNAL", "WAITING_USER", "RESOLVED", "CLOSED",
    "REOPENED", "CLOSED_LEGACY",
  ]).optional(),
  priority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]).optional(),
  slaStatus: z.enum(["AT_RISK", "BREACHED", "PAUSED"]).optional(),
  ownership: z.enum(["ALL", "MINE", "UNASSIGNED"]).default("ALL"),
}).strict();

export const assignWorkspaceTicketSchema = z.object({
  ownerUserId: z.number().int().positive("شناسه مالک معتبر نیست"),
  reason: requiredText("دلیل تخصیص الزامی است", 500),
}).strict();

export const transferWorkspaceTicketSchema = z.object({
  queueId: z.number().int().positive("شناسه صف معتبر نیست"),
  reason: requiredText("دلیل انتقال الزامی است", 500),
}).strict();

export const workspaceMessageSchema = z.object({
  message: requiredText("متن پیام الزامی است", 5000),
  attachments: z.array(attachmentSchema).max(10, "حداکثر ۱۰ فایل مجاز است").default([]),
}).strict();

export const requestCustomerInputSchema = workspaceMessageSchema;

export const resolveWorkspaceTicketSchema = z.object({
  actionTaken: requiredText("اقدام انجام‌شده الزامی است", 5000),
  finalResponse: requiredText("پاسخ نهایی الزامی است", 5000),
  rootCause: z.string().trim().max(5000, "علت ریشه‌ای بیش از حد طولانی است").optional(),
  normalizedRootCauseId: z.number().int().positive("علت ریشه‌ای استاندارد معتبر نیست").optional(),
}).strict();

export const mergeWorkspaceTicketSchema = z.object({
  targetTicketId: z.string().trim().regex(/^TK-[A-Z0-9-]{1,97}$/i, "شناسه تیکت مقصد معتبر نیست"),
  reason: requiredText("دلیل ادغام الزامی است", 500),
}).strict();

export const workspaceRootCauseQuerySchema = z.object({
  serviceCode: z.string().trim().min(1).max(64).regex(/^[A-Z][A-Z0-9_]*$/),
}).strict();

export const changeWorkspaceTicketPrioritySchema = z.object({
  priority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]),
  reason: requiredText("دلیل تغییر اولویت الزامی است", 500),
}).strict();

export const addWorkspaceCollaboratorSchema = z.object({
  queueId: z.number().int().positive("شناسه صف معتبر نیست"),
  assignedUserId: z.number().int().positive().optional(),
  request: requiredText("شرح همکاری الزامی است", 5000),
}).strict();

export const completeWorkspaceWorkItemSchema = z.object({
  response: requiredText("نتیجه همکاری الزامی است", 5000),
}).strict();

export const cancelWorkspaceWorkItemSchema = z.object({
  reason: requiredText("دلیل لغو الزامی است", 500),
}).strict();

export const decideAccountReviewSchema = z.object({
  note: requiredText("توضیح تصمیم الزامی است", 2000),
}).strict();

export type WorkspaceTicketListQuery = z.output<typeof workspaceTicketListQuerySchema>;
export type AssignWorkspaceTicketInput = z.output<typeof assignWorkspaceTicketSchema>;
export type TransferWorkspaceTicketInput = z.output<typeof transferWorkspaceTicketSchema>;
export type WorkspaceMessageInput = z.output<typeof workspaceMessageSchema>;
export type ResolveWorkspaceTicketInput = z.output<typeof resolveWorkspaceTicketSchema>;
export type MergeWorkspaceTicketInput = z.output<typeof mergeWorkspaceTicketSchema>;
export type WorkspaceRootCauseQuery = z.output<typeof workspaceRootCauseQuerySchema>;
export type ChangeWorkspaceTicketPriorityInput = z.output<typeof changeWorkspaceTicketPrioritySchema>;
export type AddWorkspaceCollaboratorInput = z.output<typeof addWorkspaceCollaboratorSchema>;
export type CompleteWorkspaceWorkItemInput = z.output<typeof completeWorkspaceWorkItemSchema>;
export type CancelWorkspaceWorkItemInput = z.output<typeof cancelWorkspaceWorkItemSchema>;
export type DecideAccountReviewInput = z.output<typeof decideAccountReviewSchema>;
