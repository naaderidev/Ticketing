"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CustomerSupportIncident, SupportIncident, SupportIncidentSeverity } from "@/types/support-incident";

type ApiList<T> = { data: T[] };
type ApiItem<T> = { data: T };
type ApiFailure = { error?: { message?: string } };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) {
    let message = "درخواست ناموفق بود";
    try { message = ((await response.json()) as ApiFailure).error?.message ?? message; } catch { /* invalid response */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function useWorkspaceIncidents() {
  return useQuery<SupportIncident[]>({
    queryKey: ["workspace-incidents"],
    queryFn: async () => (await request<ApiList<SupportIncident>>("/api/v2/workspace/incidents")).data,
  });
}

export function useCustomerIncidents(activePartyId: number | undefined) {
  return useQuery<CustomerSupportIncident[]>({
    queryKey: ["customer-incidents", activePartyId],
    enabled: activePartyId !== undefined,
    queryFn: async () => (await request<ApiList<CustomerSupportIncident>>("/api/v2/incidents")).data,
  });
}

export function useIncidentCommands() {
  const client = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["workspace-incidents"] }),
      client.invalidateQueries({ queryKey: ["customer-incidents"] }),
    ]);
  };
  const create = useMutation({
    mutationFn: async (input: {
      title: string;
      description: string;
      severity: SupportIncidentSeverity;
      linkedTicketIds: string[];
      impactedPartyIds: number[];
    }) => (await request<ApiItem<SupportIncident>>("/api/v2/workspace/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, sourceType: "MANUAL" }),
    })).data,
    onSuccess: refresh,
  });
  const notify = useMutation({
    mutationFn: async (input: { incidentKey: string; message: string }) =>
      (await request<ApiItem<SupportIncident>>(`/api/v2/workspace/incidents/${encodeURIComponent(input.incidentKey)}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input.message }),
      })).data,
    onSuccess: refresh,
  });
  const resolve = useMutation({
    mutationFn: async (input: { incidentKey: string; resolutionSummary: string }) =>
      (await request<ApiItem<SupportIncident>>(`/api/v2/workspace/incidents/${encodeURIComponent(input.incidentKey)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolutionSummary: input.resolutionSummary }),
      })).data,
    onSuccess: refresh,
  });
  return { create, notify, resolve };
}
