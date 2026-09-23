"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkspacePredefinedMessage, WorkspaceQueue, WorkspaceRootCause, WorkspaceSlaStatus, WorkspaceSlaSummary, WorkspaceTicket, WorkspaceTicketPage, WorkspaceTicketPriority, WorkspaceTicketStatus } from "@/types/workspace-ticket-v2";

type ApiSuccess<T> = { data: T };
type ApiFailure = { error?: { code?: string; message?: string; requestId?: string } };
export class WorkspaceApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly requestId: string | null) { super(message); this.name = "WorkspaceApiError"; }
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) {
    let body: ApiFailure = {};
    try { body = await response.json() as ApiFailure; } catch { /* response is not JSON */ }
    throw new WorkspaceApiError(body.error?.message ?? "درخواست ناموفق بود", response.status, body.error?.code ?? "UNKNOWN_ERROR", body.error?.requestId ?? response.headers.get("x-request-id"));
  }
  return response.json() as Promise<T>;
}
function headers(ticketId: string, version: number, key: string): HeadersInit { return { "Content-Type": "application/json", "Idempotency-Key": key, "If-Match": `W/\"ticket-${ticketId}-v${version}\"` }; }

export function useWorkspaceQueues() { return useQuery<WorkspaceQueue[]>({ queryKey: ["workspace-queues-v2"], queryFn: async () => (await request<ApiSuccess<WorkspaceQueue[]>>("/api/v2/workspace/queues")).data }); }
export function useWorkspacePredefinedMessages(enabled = true) { return useQuery<WorkspacePredefinedMessage[]>({ queryKey: ["workspace-predefined-messages-v2"], enabled, queryFn: async () => (await request<ApiSuccess<WorkspacePredefinedMessage[]>>("/api/v2/workspace/predefined-messages")).data }); }
export function useWorkspaceRootCauses(serviceCode: string, enabled = true) { return useQuery<WorkspaceRootCause[]>({ queryKey: ["workspace-root-causes-v2", serviceCode], enabled: enabled && Boolean(serviceCode), queryFn: async () => (await request<ApiSuccess<WorkspaceRootCause[]>>(`/api/v2/workspace/root-causes?serviceCode=${encodeURIComponent(serviceCode)}`)).data }); }
export function useWorkspaceTickets(input: { cursor?: string | null; queueId?: number; status?: WorkspaceTicketStatus; priority?: WorkspaceTicketPriority; slaStatus?: WorkspaceSlaStatus; ownership?: "ALL" | "MINE" | "UNASSIGNED"; limit?: number }) {
  const params = new URLSearchParams();
  if (input.cursor) params.set("cursor", input.cursor); if (input.queueId) params.set("queueId", String(input.queueId)); if (input.status) params.set("status", input.status); if (input.priority) params.set("priority", input.priority); if (input.slaStatus) params.set("slaStatus", input.slaStatus); if (input.ownership) params.set("ownership", input.ownership); params.set("limit", String(input.limit ?? 25));
  return useQuery<WorkspaceTicketPage>({ queryKey: ["workspace-tickets-v2", input], queryFn: () => request(`/api/v2/workspace/tickets?${params}`) });
}
export function useWorkspaceSlaSummary() { return useQuery<WorkspaceSlaSummary>({ queryKey: ["workspace-sla-summary-v2"], queryFn: async () => (await request<ApiSuccess<WorkspaceSlaSummary>>("/api/v2/workspace/tickets/sla-summary")).data }); }
export function useWorkspaceTicket(ticketId: string) { return useQuery<WorkspaceTicket>({ queryKey: ["workspace-ticket-v2", ticketId], enabled: Boolean(ticketId), queryFn: async () => (await request<ApiSuccess<WorkspaceTicket>>(`/api/v2/workspace/tickets/${encodeURIComponent(ticketId)}`)).data }); }

type WorkspaceCommand = { ticketId: string; version: number; path: string; body: unknown; idempotencyKey: string };
export function useWorkspaceCommand() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: WorkspaceCommand) => (await request<ApiSuccess<WorkspaceTicket>>(`/api/v2/workspace/tickets/${encodeURIComponent(input.ticketId)}/${input.path}`, { method: "POST", headers: headers(input.ticketId, input.version, input.idempotencyKey), body: JSON.stringify(input.body) })).data,
    onSuccess: async (ticket) => { client.setQueryData(["workspace-ticket-v2", ticket.ticketId], ticket); await Promise.all([client.invalidateQueries({ queryKey: ["workspace-tickets-v2"] }), client.invalidateQueries({ queryKey: ["workspace-queues-v2"] })]); },
    onError: async (error, input) => { if (error instanceof WorkspaceApiError && ["CONCURRENT_MODIFICATION", "INVALID_TRANSITION"].includes(error.code)) await client.invalidateQueries({ queryKey: ["workspace-ticket-v2", input.ticketId] }); },
  });
}
