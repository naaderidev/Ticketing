"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type PartyContext = {
  partyId: number;
  type: "PERSON" | "ORGANIZATION";
  displayName: string;
  organization: {
    id: number;
    legalName: string;
    membershipId: number;
    role: "REPRESENTATIVE" | "MANAGER";
    scopes: Array<{
      type: "ORGANIZATION" | "BRANCH" | "CONTRACT" | "ASSET";
      scopeKey: string;
    }>;
  } | null;
};

export type PartyContextSnapshot = {
  activePartyId: number;
  contexts: PartyContext[];
};

type ApiV2Response<T> = {
  data: T;
};

export type OrganizationSummary = {
  id: number;
  partyId: number;
  legalName: string;
  nationalId: string | null;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  _count: { memberships: number; accessRequests: number };
};

export type OrganizationMembership = {
  id: number;
  role: "REPRESENTATIVE" | "MANAGER";
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED";
  validFrom: string;
  validTo: string | null;
  user: { id: number; firstName: string; lastName: string };
  scopes: Array<{
    type: "ORGANIZATION" | "BRANCH" | "CONTRACT" | "ASSET";
    scopeKey: string;
  }>;
};

export type OrganizationDetails = OrganizationSummary & {
  memberships: OrganizationMembership[];
};

export type OrganizationAccessRequest = {
  id: number;
  requestType:
    | "ADD_MEMBERSHIP"
    | "CHANGE_ROLE"
    | "CHANGE_SCOPE"
    | "REVOKE_MEMBERSHIP";
  requestedRole: "REPRESENTATIVE" | "MANAGER" | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED";
  reason: string;
  decisionReason: string | null;
  decidedAt: string | null;
  createdAt: string;
  requestedBy: { id: number; firstName: string; lastName: string };
  targetUser: { id: number; firstName: string; lastName: string };
  decidedBy: { id: number; firstName: string; lastName: string } | null;
  scopes: Array<{
    type: "ORGANIZATION" | "BRANCH" | "CONTRACT" | "ASSET";
    scopeKey: string;
  }>;
};

export type CompanySupportOverview = {
  organization: {
    id: number;
    legalName: string;
    nationalId: string | null;
    role: "REPRESENTATIVE" | "MANAGER";
    scopes: Array<{
      type: "ORGANIZATION" | "BRANCH" | "CONTRACT" | "ASSET";
      scopeKey: string;
    }>;
  };
  branches: Array<{ id: number; name: string; code: string }>;
  representatives: Array<{
    id: number;
    name: string;
    role: "REPRESENTATIVE" | "MANAGER";
    isCurrentUser: boolean;
    scopes: Array<{
      type: "ORGANIZATION" | "BRANCH" | "CONTRACT" | "ASSET";
      scopeKey: string;
    }>;
  }>;
  contracts: Array<{ key: string; label: string }>;
  assets: Array<{ key: string; label: string }>;
  companyReport: {
    reviewedCount: number;
    approvedCount: number;
    pendingCount: number;
    results: Array<{
      ticketId: string;
      subject: string;
      resolutionSummary: string | null;
      status: "PENDING" | "APPROVED" | "CHANGES_REQUESTED";
      decidedAt: string | null;
      decisionNote: string | null;
    }>;
  };
};

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string };
    };
    return body.error?.message ?? "خطا در ارتباط با سرور";
  } catch {
    return "خطا در ارتباط با سرور";
  }
}

export function usePartyContexts(enabled = true) {
  return useQuery<PartyContextSnapshot>({
    queryKey: ["party-contexts"],
    enabled,
    queryFn: async () => {
      const response = await fetch("/api/v2/me/contexts");
      if (!response.ok) throw new Error(await readApiError(response));
      const body = (await response.json()) as ApiV2Response<PartyContextSnapshot>;
      return body.data;
    },
  });
}

export function useCompanySupportOverview(
  activePartyId: number | undefined,
  enabled: boolean
) {
  return useQuery<CompanySupportOverview>({
    queryKey: ["company-support-overview", activePartyId],
    enabled: enabled && activePartyId !== undefined,
    queryFn: async () => {
      const response = await fetch("/api/v2/me/company-support", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const body = (await response.json()) as ApiV2Response<CompanySupportOverview>;
      return body.data;
    },
  });
}

export function useSwitchPartyContext() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (partyId: number) => {
      const response = await fetch("/api/v2/me/active-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const body = (await response.json()) as ApiV2Response<PartyContext>;
      return body.data;
    },
    onSuccess: (context) => {
      queryClient.setQueryData<PartyContextSnapshot>(
        ["party-contexts"],
        (snapshot) =>
          snapshot
            ? { ...snapshot, activePartyId: context.partyId }
            : snapshot
      );
    },
  });
}

export function useOrganizations() {
  return useQuery<OrganizationSummary[]>({
    queryKey: ["organizations"],
    queryFn: async () => {
      const response = await fetch("/api/v2/organizations");
      if (!response.ok) throw new Error(await readApiError(response));
      const body = (await response.json()) as ApiV2Response<
        OrganizationSummary[]
      >;
      return body.data;
    },
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      legalName: string;
      nationalId?: string;
      managerUserId: number;
    }) => {
      const response = await fetch("/api/v2/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      return (await response.json()) as ApiV2Response<OrganizationSummary>;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      await queryClient.invalidateQueries({ queryKey: ["party-contexts"] });
    },
  });
}

export function useOrganizationMemberships(organizationId: number | null) {
  return useQuery<OrganizationDetails>({
    queryKey: ["organization-memberships", organizationId],
    enabled: organizationId !== null,
    queryFn: async () => {
      const response = await fetch(
        `/api/v2/organizations/${organizationId}/memberships`
      );
      if (!response.ok) throw new Error(await readApiError(response));
      const body = (await response.json()) as ApiV2Response<OrganizationDetails>;
      return body.data;
    },
  });
}

export function useOrganizationAccessRequests(organizationId: number | null) {
  return useQuery<OrganizationAccessRequest[]>({
    queryKey: ["organization-access-requests", organizationId],
    enabled: organizationId !== null,
    queryFn: async () => {
      const response = await fetch(
        `/api/v2/organizations/${organizationId}/access-requests`
      );
      if (!response.ok) throw new Error(await readApiError(response));
      const body = (await response.json()) as ApiV2Response<
        OrganizationAccessRequest[]
      >;
      return body.data;
    },
  });
}

export function useCreateOrganizationAccessRequest(
  organizationId: number | null
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      targetUserId: number;
      requestType: OrganizationAccessRequest["requestType"];
      requestedRole?: "REPRESENTATIVE" | "MANAGER";
      scopes: Array<{
        type: "ORGANIZATION" | "BRANCH" | "CONTRACT" | "ASSET";
        scopeKey: string;
      }>;
      reason: string;
    }) => {
      if (organizationId === null) throw new Error("سازمان انتخاب نشده است");
      const response = await fetch(
        `/api/v2/organizations/${organizationId}/access-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      );
      if (!response.ok) throw new Error(await readApiError(response));
      return (await response.json()) as ApiV2Response<OrganizationAccessRequest>;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["organization-access-requests", organizationId],
      });
    },
  });
}

export function useDecideOrganizationAccessRequest(
  organizationId: number | null
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      requestId: number;
      decision: "approve" | "reject";
      reason: string;
    }) => {
      const response = await fetch(
        `/api/v2/access-requests/${input.requestId}/${input.decision}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: input.reason }),
        }
      );
      if (!response.ok) throw new Error(await readApiError(response));
      return (await response.json()) as ApiV2Response<{
        id: number;
        organizationId: number;
        status: string;
      }>;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["organization-access-requests", organizationId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["organization-memberships", organizationId],
        }),
        queryClient.invalidateQueries({ queryKey: ["party-contexts"] }),
      ]);
    },
  });
}
