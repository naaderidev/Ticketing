import {
  addWorkspaceCollaboratorSchema,
  assignWorkspaceTicketSchema,
  cancelWorkspaceWorkItemSchema,
  changeWorkspaceTicketPrioritySchema,
  mergeWorkspaceTicketSchema,
  resolveWorkspaceTicketSchema,
  completeWorkspaceWorkItemSchema,
  workspaceMessageSchema,
  workspaceTicketListQuerySchema,
} from "@/modules/tickets/contracts/workspace-ticket-schemas";

describe("workspace ticket contracts", () => {
  it("normalizes list filters and enforces bounded pagination", () => {
    expect(workspaceTicketListQuerySchema.parse({ limit: "25", ownership: "MINE" })).toEqual({ limit: 25, ownership: "MINE" });
    expect(workspaceTicketListQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(workspaceTicketListQuerySchema.safeParse({ unknown: "field" }).success).toBe(false);
  });

  it("requires a concrete primary owner and a reason", () => {
    expect(assignWorkspaceTicketSchema.parse({ ownerUserId: 12, reason: "پذیرش مسئولیت" })).toEqual({ ownerUserId: 12, reason: "پذیرش مسئولیت" });
    expect(assignWorkspaceTicketSchema.safeParse({ ownerUserId: null, reason: "بازگشت به صف" }).success).toBe(false);
  });

  it("keeps workspace message attachments bounded and strict", () => {
    expect(workspaceMessageSchema.safeParse({ message: "یادداشت", attachments: [], visibility: "PUBLIC" }).success).toBe(false);
    expect(workspaceMessageSchema.safeParse({ message: "یادداشت", attachments: Array.from({ length: 11 }, (_, index) => ({ uploadId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` })) }).success).toBe(false);
  });

  it("validates high-risk commands", () => {
    expect(changeWorkspaceTicketPrioritySchema.safeParse({ priority: "HIGH", reason: "اثر گسترده" }).success).toBe(true);
    expect(resolveWorkspaceTicketSchema.safeParse({ actionTaken: "نشست‌های قدیمی پاک شد", finalResponse: "دسترسی بازیابی شد" }).success).toBe(true);
    expect(resolveWorkspaceTicketSchema.safeParse({ actionTaken: "رفع شد" }).success).toBe(false);
    expect(mergeWorkspaceTicketSchema.safeParse({ targetTicketId: "TK-DEMO-0002", reason: "درخواست تکراری" }).success).toBe(true);
    expect(mergeWorkspaceTicketSchema.safeParse({ targetTicketId: "2", reason: "درخواست تکراری" }).success).toBe(false);
    expect(addWorkspaceCollaboratorSchema.safeParse({ queueId: 3, request: "بررسی تخصصی" }).success).toBe(true);
    expect(addWorkspaceCollaboratorSchema.safeParse({ queueId: 0, request: "بررسی" }).success).toBe(false);
  });

  it("requires an explicit result or cancellation reason for work items", () => {
    expect(completeWorkspaceWorkItemSchema.safeParse({ response: "بررسی شد" }).success).toBe(true);
    expect(completeWorkspaceWorkItemSchema.safeParse({ response: "" }).success).toBe(false);
    expect(cancelWorkspaceWorkItemSchema.safeParse({ reason: "نیاز رفع شد" }).success).toBe(true);
  });
});
