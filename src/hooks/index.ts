"use client";

export { useTickets, useTicket, useCreateTicket, useUpdateTicket, useDeleteTicket, useAddReply, useRateTicket } from "./tickets";
export type { TicketFilters } from "./tickets";

export { useDepartments, useDepartment, useCreateDepartment, useUpdateDepartment, useDeleteDepartment, useSubDepartments, useAllSubDepartments, useCreateSubDepartment, useUpdateSubDepartment, useDeleteSubDepartment } from "./departments";

export { useFaqs, useCreateFaq, useUpdateFaq, useDeleteFaq, useReorderFaqs } from "./faqs";

export { useMessages, useCreateMessage, useUpdateMessage, useDeleteMessage } from "./messages";

export { useUsers, useCreateUser, useUpdateUserRole } from "./users";

export { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "./notifications";

export {
  useCreateOrganization,
  useCreateOrganizationAccessRequest,
  useCompanySupportOverview,
  useDecideOrganizationAccessRequest,
  useOrganizationAccessRequests,
  useOrganizationMemberships,
  useOrganizations,
  usePartyContexts,
  useSwitchPartyContext,
} from "./organization-contexts";
export type {
  CompanySupportOverview,
  OrganizationAccessRequest,
  OrganizationDetails,
  OrganizationMembership,
  OrganizationSummary,
  PartyContext,
} from "./organization-contexts";

export {
  useAssignSupportTeamMember,
  useCreateSupportRequestType,
  useCreateSupportService,
  useCreateSupportTeam,
  usePublishSupportRoute,
  useReconcileLegacySupportMapping,
  useSupportManagementSnapshot,
  useSupportTeamMemberCandidates,
} from "./support-catalog";

export {
  ReportingApiError,
  useAutomatedResolutionReport,
  useQualityReport,
  useRecurringProblemDrillDown,
  useRecurringProblemsReport,
  useReportingExport,
  useTicketPerTransactionReport,
  useTimeSlaReport,
} from "./reporting-dashboard";

export {
  CustomerApiError,
  useAddCustomerMessageV2,
  useBusinessReferenceSearch,
  useCreateCustomerTicketV2,
  useCustomerSupportCatalogV2,
  useTransitionCustomerTicketV2,
  useCustomerTicketV2,
  useCustomerTicketsV2,
  useRateCustomerTicketV2,
} from "./customer-tickets-v2";

export {
  useConfirmKnowledgeResolution,
  useCustomerKnowledgeArticles,
  useCustomerKnowledgeJourney,
  useStartKnowledgeJourney,
} from "./customer-support-center";

export {
  useArchiveWorkspaceKnowledgeArticle,
  useCreateWorkspaceKnowledgeArticle,
  usePublishWorkspaceKnowledgeArticle,
  useUpdateWorkspaceKnowledgeArticle,
  useWorkspaceKnowledgeArticles,
  WorkspaceKnowledgeError,
} from "./workspace-knowledge";

export {
  WorkspaceApiError,
  useWorkspaceCommand,
  useWorkspacePredefinedMessages,
  useWorkspaceQueues,
  useWorkspaceRootCauses,
  useWorkspaceSlaSummary,
  useWorkspaceTicket,
  useWorkspaceTickets,
} from "./workspace-tickets-v2";
export type {
  LegacySupportCatalogMapping,
  SupportManagementSnapshot,
  SupportPriority,
  SupportQueue,
  SupportRequestType,
  SupportRoute,
  SupportService,
  SupportTeam,
  SupportTeamMemberCandidate,
} from "./support-catalog";
