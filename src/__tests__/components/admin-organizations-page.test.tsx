import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import AdminOrganizationsPage from "@/app/admin/organizations/page";
import {
  useCreateOrganization,
  useCreateOrganizationAccessRequest,
  useDecideOrganizationAccessRequest,
  useOrganizationAccessRequests,
  useOrganizationMemberships,
  useOrganizations,
  useUsers,
} from "@/hooks";

jest.mock("@/hooks", () => ({
  useCreateOrganization: jest.fn(),
  useCreateOrganizationAccessRequest: jest.fn(),
  useDecideOrganizationAccessRequest: jest.fn(),
  useOrganizationAccessRequests: jest.fn(),
  useOrganizationMemberships: jest.fn(),
  useOrganizations: jest.fn(),
  useUsers: jest.fn(),
}));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

const idleMutation = { isPending: false, mutate: jest.fn() };

describe("AdminOrganizationsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useOrganizations as jest.Mock).mockReturnValue({
      data: [{ id: 4, legalName: "شرکت انرژی آفتاب", nationalId: null }],
      isLoading: false,
      isError: false,
    });
    (useUsers as jest.Mock).mockReturnValue({
      data: [
        {
          id: 5,
          firstName: "زهرا",
          lastName: "رضایی",
          mobile: "09120000000",
          nationalCode: "0010000000",
          role: "USER",
        },
      ],
    });
    (useOrganizationMemberships as jest.Mock).mockReturnValue({
      data: { memberships: [] },
    });
    (useOrganizationAccessRequests as jest.Mock).mockReturnValue({ data: [] });
    (useCreateOrganization as jest.Mock).mockReturnValue(idleMutation);
    (useCreateOrganizationAccessRequest as jest.Mock).mockReturnValue(idleMutation);
    (useDecideOrganizationAccessRequest as jest.Mock).mockReturnValue(idleMutation);
  });

  it("starts an add-membership request from the members card", async () => {
    render(<AdminOrganizationsPage />);

    const requestType = await screen.findByLabelText("نوع درخواست");
    fireEvent.change(requestType, { target: { value: "CHANGE_ROLE" } });

    fireEvent.click(screen.getByRole("button", { name: "افزودن عضو" }));

    expect(requestType).toHaveValue("ADD_MEMBERSHIP");
    const targetUser = screen.getByLabelText("کاربر هدف");
    expect(targetUser).toHaveFocus();
    expect(
      within(targetUser).getByRole("option", { name: /زهرا رضایی/ })
    ).toBeInTheDocument();
  });
});
