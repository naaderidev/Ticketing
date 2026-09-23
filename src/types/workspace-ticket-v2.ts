import type { CustomerAttachment, CursorPage } from "@/types/customer-ticket-v2";

export type WorkspaceTicketStatus = "NEW" | "UNASSIGNED" | "IN_PROGRESS" | "INTERNAL_REFERRAL" | "WAITING_INTERNAL" | "WAITING_USER" | "RESOLVED" | "CLOSED" | "REOPENED" | "CLOSED_LEGACY";
export type WorkspaceTicketPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
export type WorkspaceSlaStatus = "AT_RISK" | "BREACHED" | "PAUSED";
export type WorkspaceCapabilities = { assign: boolean; transfer: boolean; reply: boolean; internalNote: boolean; requestCustomerInput: boolean; resolve: boolean; changePriority: boolean; collaborate: boolean; merge: boolean; accountReview?: boolean };
export type WorkspaceQueue = { id: number; code: string; name: string; isDefault: boolean; team: { id: number; code: string; name: string }; ticketCount: number };
export type WorkspacePredefinedMessage = { id: number; title: string; content: string; shortCode: string; category: string };
export type WorkspaceRootCause = { id: number; code: string; name: string; serviceCode: string | null };
export type WorkspaceTicketListItem = {
  ticketId: string; subject: string; status: WorkspaceTicketStatus; priority: WorkspaceTicketPriority; version: number;
  requestType: { code: string; name: string; service: { code: string; name: string } } | null;
  supportTeam: { id: number; code: string; name: string } | null; queue: { id: number; code: string; name: string } | null;
  owner: { id: number; name: string } | null; capabilities: WorkspaceCapabilities;
  sla: {
    firstResponse: { state: string; dueAt: string; warningLevel: string };
    resolution: {
      state: string;
      dueAt: string;
      paused: boolean;
      warningLevel: string;
      escalationLevel: string;
      cycleNumber: number;
      cycleStartedAt: string;
    };
  } | null;
  createdAt: string; updatedAt: string;
};
export type WorkspaceMessage = { id: string; visibility: "PUBLIC" | "INTERNAL"; authorType: "CUSTOMER" | "STAFF" | "SYSTEM"; authorLabel: string | null; body: string; attachments: CustomerAttachment[]; createdAt: string };
export type WorkspaceTicket = Omit<WorkspaceTicketListItem, "requestType"> & {
  requestType: { code: string; name: string; requiresRootCause: boolean; service: { code: string; name: string } };
  customer: { id: number; displayName: string; type: string } | null;
  organization: { id: number; legalName: string } | null;
  organizationRole: "MANAGER" | "REPRESENTATIVE" | null;
  rootCause: string | null; resolutionSummary: string | null; actionTaken: string | null; finalResponse: string | null; rating: number | null;
  normalizedRootCause: WorkspaceRootCause | null;
  servicePlan?: { id: number; name: string; contractReferenceKey: string; firstResponseMinutes: number; resolutionMinutes: number; accountManagerUserId: number | null } | null;
  accountReview?: { status: "PENDING" | "APPROVED" | "CHANGES_REQUESTED"; accountManagerUserId: number; requestedAt: string; decidedAt: string | null; decisionNote: string | null } | null;
  messages: WorkspaceMessage[];
  assignments: Array<{ id: string; reason: string | null; startedAt: string; endedAt: string | null; supportTeam: { id: number; name: string }; queue: { id: number; name: string }; owner: { id: number; name: string } | null; assignedBy: { id: number; name: string } | null }>;
  workItems: Array<{ id: string; request: string; response: string | null; status: "OPEN" | "COMPLETED" | "CANCELLED"; createdAt: string; completedAt: string | null; supportTeam: { id: number; name: string }; queue: { id: number; name: string }; assignedUser: { id: number; name: string } | null; requestedBy: { id: number; name: string }; capabilities: { complete: boolean; cancel: boolean } }>;
  businessReferences: Array<{ referenceType: string; referenceKey: string; displayLabel: string | null; verificationStatus: string }>;
  relatedHistory?: Array<{ ticketId: string; subject: string; status: WorkspaceTicketStatus | null; resolutionSummary: string | null; createdAt: string }>;
  customerHistory: Array<{ ticketId: string; subject: string; status: WorkspaceTicketStatus | null; resolutionSummary: string | null; createdAt: string }>;
  mergedInto: { ticketId: string; subject: string } | null;
  mergedTickets: Array<{ ticketId: string; subject: string; mergedAt: string | null; mergeReason: string | null }>;
  resolutionCycle: { sequence: number; proposedAt: string; reminderOneAt: string; reminderTwoAt: string; autoCloseAt: string; reminderCount: number } | null;
};
export type WorkspaceTicketPage = { data: WorkspaceTicketListItem[]; page: CursorPage };
export type WorkspaceSlaSummary = { breached: number; atRisk: number; paused: number; new: number; urgent: number; waitingUser: number; waitingInternal: number; unassigned: number; reopened: number };
