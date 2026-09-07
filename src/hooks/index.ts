"use client";

export { useTickets, useTicket, useCreateTicket, useUpdateTicket, useDeleteTicket, useAddReply, useRateTicket } from "./tickets";
export type { TicketFilters } from "./tickets";

export { useDepartments, useDepartment, useCreateDepartment, useUpdateDepartment, useDeleteDepartment, useSubDepartments, useAllSubDepartments, useCreateSubDepartment, useUpdateSubDepartment, useDeleteSubDepartment } from "./departments";

export { useFaqs, useCreateFaq, useUpdateFaq, useDeleteFaq, useReorderFaqs } from "./faqs";

export { useMessages, useCreateMessage, useUpdateMessage, useDeleteMessage } from "./messages";

export { useUsers, useCreateUser, useUpdateUserRole } from "./users";

export { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "./notifications";
