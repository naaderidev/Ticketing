import React from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useSwitchPartyContext,
  type PartyContext,
  type PartyContextSnapshot,
} from "@/hooks/organization-contexts";

const mockFetch = jest.mocked(global.fetch);

const organizationContext: PartyContext = {
  partyId: 70,
  type: "ORGANIZATION",
  displayName: "شرکت آفتاب",
  organization: {
    id: 4,
    legalName: "شرکت آفتاب",
    membershipId: 8,
    role: "MANAGER",
    scopes: [{ type: "ORGANIZATION", scopeKey: "*" }],
  },
};

function response(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
  } as Response;
}

describe("organization context hooks", () => {
  it("updates only the active context snapshot after a successful switch", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const initialSnapshot: PartyContextSnapshot = {
      activePartyId: 17,
      contexts: [
        {
          partyId: 17,
          type: "PERSON",
          displayName: "علی احمدی",
          organization: null,
        },
        organizationContext,
      ],
    };
    queryClient.setQueryData(["party-contexts"], initialSnapshot);
    mockFetch.mockResolvedValueOnce(response({ data: organizationContext }));
    const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSwitchPartyContext(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(organizationContext.partyId);
    });

    expect(
      queryClient.getQueryData<PartyContextSnapshot>(["party-contexts"])
        ?.activePartyId
    ).toBe(organizationContext.partyId);
  });
});
