import type { PendingAttachment } from "@/types/ticket";

export type CustomerTicketStatus =
  | "IN_PROGRESS"
  | "WAITING_USER"
  | "RESOLVED"
  | "CLOSED";

export type CustomerTicketPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

export type CustomerAttachment = {
  id: number;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileUrl: string;
  createdAt?: string;
};

export type CustomerTicketMessage = {
  id: string;
  authorType: "CUSTOMER" | "STAFF" | "SYSTEM";
  authorLabel: string;
  body: string;
  attachments: CustomerAttachment[];
  createdAt: string;
};

export type CustomerBusinessReference = {
  referenceType: string;
  referenceKey: string;
  displayLabel: string | null;
  verificationStatus: "VERIFIED" | "UNVERIFIED" | "LEGACY";
  sourceSystem: string | null;
  entityType: string | null;
  externalId: string | null;
  snapshotFetchedAt: string | null;
  snapshotExpiresAt: string | null;
  sourceVersion: string | null;
  sourceEtag: string | null;
};

export type CustomerTicket = {
  ticketId: string;
  subject: string;
  status: CustomerTicketStatus;
  priority: CustomerTicketPriority;
  version: number;
  rating: number | null;
  resolutionSummary: string | null;
  requestType: {
    code: string;
    name: string;
    service: { code: string; name: string };
  };
  organization: { id: number; legalName: string } | null;
  businessReferences: CustomerBusinessReference[];
  sla: {
    policy: { code: string; version: number };
    mode: "OBSERVE_ONLY" | "ENFORCED";
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
  resolutionConfirmation: {
    proposedAt: string;
    autoCloseAt: string;
    reminderCount: number;
  } | null;
  messages: CustomerTicketMessage[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

export type CustomerTicketListItem = Pick<
  CustomerTicket,
  "ticketId" | "subject" | "status" | "priority" | "version" | "requestType" | "createdAt" | "updatedAt"
>;

export type CustomerCatalogRequestType = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  businessSubjectType: string | null;
  requiresBusinessSubject: boolean;
  requiresRootCause: boolean;
  routeVersion: number;
  defaultPriority: CustomerTicketPriority;
  slaPolicy: {
    code: string;
    version: number;
    clockType: "CALENDAR" | "BUSINESS";
    firstResponseMinutes: number;
    resolutionMinutes: number;
  };
};

export type CustomerCatalogService = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  requestTypes: CustomerCatalogRequestType[];
};

export type BusinessReferenceOption = {
  sourceSystem: string;
  entityType: string;
  externalId: string;
  displayLabel: string;
  snapshotFetchedAt: string;
  snapshotExpiresAt: string | null;
  sourceVersion: string | null;
  sourceEtag: string | null;
};

export type CreateCustomerTicketCommand = {
  requestTypeId: number;
  subject: string;
  description: string;
  supportJourneyId?: string;
  businessReferences: Array<{ type: string; key: string }>;
  attachments: Array<Pick<PendingAttachment, "uploadId">>;
};

export type CursorPage = {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
};
