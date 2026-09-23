import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { PartyContextSwitcher } from "@/components/shared/party-context-switcher";
import {
  usePartyContexts,
  useSwitchPartyContext,
  type PartyContext,
} from "@/hooks/organization-contexts";

const mockPathname = jest.fn();
const mockReplace = jest.fn();
const mockRefresh = jest.fn();
const mockMutate = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
}));
jest.mock("@/hooks/organization-contexts", () => ({
  usePartyContexts: jest.fn(),
  useSwitchPartyContext: jest.fn(),
}));
jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const personContext: PartyContext = {
  partyId: 17,
  type: "PERSON",
  displayName: "علی احمدی",
  organization: null,
};

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

describe("PartyContextSwitcher", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/user/tickets/TK-DEMO-0001");
    (usePartyContexts as jest.Mock).mockReturnValue({
      data: {
        activePartyId: personContext.partyId,
        contexts: [personContext, organizationContext],
      },
    });
    (useSwitchPartyContext as jest.Mock).mockReturnValue({
      isPending: false,
      mutate: mockMutate,
    });
    mockMutate.mockImplementation(
      (
        partyId: number,
        callbacks: { onSuccess: (context: PartyContext) => void }
      ) => {
        if (partyId === organizationContext.partyId) {
          callbacks.onSuccess(organizationContext);
        }
      }
    );
  });

  function selectOrganization() {
    fireEvent.click(
      screen.getByLabelText("انتخاب حساب فردی یا سازمانی")
    );
    fireEvent.click(screen.getByText("شرکت آفتاب"));
  }

  it("asks for confirmation on a ticket detail and redirects to the safe list", () => {
    render(<PartyContextSwitcher />);

    selectOrganization();

    expect(screen.getByText("تغییر حساب فعال؟")).toBeInTheDocument();
    expect(screen.getByText(/اگر متنی وارد کرده‌اید/)).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "تغییر حساب" }));

    expect(mockMutate).toHaveBeenCalledWith(
      organizationContext.partyId,
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      })
    );
    expect(mockReplace).toHaveBeenCalledWith("/user/tickets");
    expect(
      screen.getByText("در حال تغییر حساب به «شرکت آفتاب»…")
    ).toBeInTheDocument();
  });

  it("switches directly on the ticket list without showing a confirmation", () => {
    mockPathname.mockReturnValue("/user/tickets");
    render(<PartyContextSwitcher />);

    selectOrganization();

    expect(screen.queryByText("تغییر حساب فعال؟")).not.toBeInTheDocument();
    expect(mockMutate).toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
