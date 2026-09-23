"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type ApiV2Response<T> = { data: T };
type ApiV2Error = { error?: { message?: string } };

export type SupportPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

export type SupportSlaPolicy = {
  id?: number;
  code: string;
  version: number;
  clockType: "CALENDAR" | "BUSINESS";
  firstResponseMinutes: number;
  resolutionMinutes: number;
};

export type SupportQueue = {
  id: number;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  isDefault: boolean;
};

export type SupportTeam = {
  id: number;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  queues: SupportQueue[];
  roleAssignments: Array<{
    id: number;
    status: string;
    validFrom: string;
    validTo: string | null;
    user: { id: number; firstName: string; lastName: string };
    role: { key: string; name: string };
  }>;
};

export type SupportRoute = {
  id: number;
  version: number;
  status: "ACTIVE" | "RETIRED";
  defaultPriority: SupportPriority;
  effectiveFrom: string;
  effectiveTo: string | null;
  slaPolicy: SupportSlaPolicy;
  queue: SupportQueue & {
    team: { id: number; code: string; name: string };
  };
};

export type SupportRequestType = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
  businessSubjectType: string | null;
  requiresBusinessSubject: boolean;
  requiresRootCause: boolean;
  routes: SupportRoute[];
};

export type SupportService = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
  requestTypes: SupportRequestType[];
};

export type LegacySupportCatalogMapping = {
  id: number;
  sourceType: "DEPARTMENT" | "SUB_DEPARTMENT";
  legacyId: number;
  status: "PENDING" | "MAPPED" | "IGNORED" | "CONFLICT";
  reviewedAt: string | null;
  department: { id: number; name: string } | null;
  subDepartment: {
    id: number;
    name: string;
    department: { id: number; name: string };
  } | null;
  supportService: { id: number; code: string; name: string } | null;
  supportRequestType: { id: number; code: string; name: string } | null;
};

export type SupportManagementSnapshot = {
  services: SupportService[];
  teams: SupportTeam[];
  legacyMappings: LegacySupportCatalogMapping[];
};

export type SupportTeamMemberCandidate = {
  id: number;
  firstName: string;
  lastName: string;
};

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiV2Error;
    return body.error?.message ?? "درخواست ناموفق بود";
  } catch {
    return "درخواست ناموفق بود";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(await readApiError(response));
  return ((await response.json()) as ApiV2Response<T>).data;
}

function jsonRequest(method: "POST" | "PATCH", body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function useSupportManagementSnapshot() {
  return useQuery<SupportManagementSnapshot>({
    queryKey: ["support-management"],
    queryFn: () => request("/api/v2/workspace/catalog"),
  });
}

export function useSupportTeamMemberCandidates() {
  return useQuery<SupportTeamMemberCandidate[]>({
    queryKey: ["support-team-member-candidates"],
    queryFn: () =>
      request("/api/v2/workspace/support-team-member-candidates"),
    retry: false,
  });
}

function useSupportMutation<TInput>(
  mutationFn: (input: TInput) => Promise<unknown>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["support-management"] });
    },
  });
}

export function useCreateSupportService() {
  return useSupportMutation<{
    code: string;
    name: string;
    description?: string;
    sortOrder: number;
  }>((input) =>
    request(
      "/api/v2/workspace/catalog/services",
      jsonRequest("POST", input)
    )
  );
}

export function useCreateSupportTeam() {
  return useSupportMutation<{
    code: string;
    name: string;
    description?: string;
    defaultQueue: { code: string; name: string; description?: string };
  }>((input) =>
    request(
      "/api/v2/workspace/support-teams",
      jsonRequest("POST", input)
    )
  );
}

export function useCreateSupportRequestType() {
  return useSupportMutation<{
    serviceId: number;
    code: string;
    name: string;
    description?: string;
    businessSubjectType?: string;
    requiresBusinessSubject: boolean;
    requiresRootCause: boolean;
    sortOrder: number;
    queueId: number;
    defaultPriority: SupportPriority;
  }>((input) =>
    request(
      "/api/v2/workspace/catalog/request-types",
      jsonRequest("POST", input)
    )
  );
}

export function useAssignSupportTeamMember() {
  return useSupportMutation<{
    teamId: number;
    userId: number;
    roleKey: "SUPPORT_AGENT" | "SUPERVISOR";
  }>((input) =>
    request(
      `/api/v2/workspace/support-teams/${input.teamId}/members`,
      jsonRequest("POST", {
        userId: input.userId,
        roleKey: input.roleKey,
      })
    )
  );
}

export function usePublishSupportRoute() {
  return useSupportMutation<{
    requestTypeId: number;
    queueId: number;
    defaultPriority: SupportPriority;
    reason: string;
  }>((input) =>
    request(
      `/api/v2/workspace/catalog/request-types/${input.requestTypeId}/routes`,
      jsonRequest("POST", {
        queueId: input.queueId,
        defaultPriority: input.defaultPriority,
        reason: input.reason,
      })
    )
  );
}

export function useReconcileLegacySupportMapping() {
  return useSupportMutation<{
    mappingId: number;
    status: "MAPPED" | "IGNORED" | "CONFLICT";
    supportServiceId?: number;
    supportRequestTypeId?: number;
  }>((input) =>
    request(
      `/api/v2/workspace/catalog/legacy-mappings/${input.mappingId}`,
      jsonRequest("PATCH", {
        status: input.status,
        supportServiceId: input.supportServiceId,
        supportRequestTypeId: input.supportRequestTypeId,
      })
    )
  );
}
