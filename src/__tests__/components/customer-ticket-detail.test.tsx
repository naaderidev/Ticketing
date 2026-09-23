import React from "react";
import { render, screen } from "@testing-library/react";
import { CustomerTicketDetail } from "@/components/customer-v2/customer-ticket-detail";
import {
  CustomerApiError,
  useAddCustomerMessageV2,
  useCustomerTicketV2,
  useRateCustomerTicketV2,
  useTransitionCustomerTicketV2,
} from "@/hooks/customer-tickets-v2";
import { usePartyContexts } from "@/hooks/organization-contexts";
import type { CustomerTicket } from "@/types/customer-ticket-v2";

jest.mock("next/navigation", () => ({
  useParams: () => ({ ticketId: "TK-DEMO-0011" }),
}));
jest.mock("@/hooks/customer-tickets-v2", () => ({
  CustomerApiError: class CustomerApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
  useAddCustomerMessageV2: jest.fn(),
  useCustomerTicketV2: jest.fn(),
  useRateCustomerTicketV2: jest.fn(),
  useTransitionCustomerTicketV2: jest.fn(),
}));
jest.mock("@/hooks/organization-contexts", () => ({
  usePartyContexts: jest.fn(),
}));
jest.mock("@/components/shared/file-upload", () => ({ FileUpload: () => null }));

const ticket: CustomerTicket = {
  ticketId: "TK-DEMO-0011",
  subject: "تاخیر در پاسخ‌گویی درخواست قبلی",
  status: "IN_PROGRESS",
  priority: "CRITICAL",
  version: 1,
  rating: null,
  resolutionSummary: null,
  requestType: {
    code: "SUPPORT_COMPLAINT",
    name: "شکایت از عملکرد پشتیبانی",
    service: { code: "SUPPORT_QUALITY", name: "کیفیت پشتیبانی" },
  },
  organization: null,
  businessReferences: [
    {
      referenceType: "RELATED_TICKET",
      referenceKey: "TK-DEMO-0004",
      displayLabel: "TK-DEMO-0004 — پیگیری تسویه فروش برق مرداد",
      verificationStatus: "VERIFIED",
      sourceSystem: "TICKETING_LOCAL",
      entityType: "RELATED_TICKET",
      externalId: "TK-DEMO-0004",
      snapshotFetchedAt: "2026-09-14T08:00:00.000Z",
      snapshotExpiresAt: null,
      sourceVersion: null,
      sourceEtag: null,
    },
  ],
  sla: null,
  resolutionConfirmation: null,
  messages: [],
  createdAt: "2026-09-14T08:00:00.000Z",
  updatedAt: "2026-09-14T08:00:00.000Z",
  closedAt: null,
};

describe("CustomerTicketDetail localization", () => {
  beforeEach(() => {
    (usePartyContexts as jest.Mock).mockReturnValue({
      data: {
        activePartyId: 17,
        contexts: [
          {
            partyId: 17,
            type: "PERSON",
            displayName: "علی احمدی",
            organization: null,
          },
        ],
      },
      error: null,
      isLoading: false,
      refetch: jest.fn(),
    });
    (useCustomerTicketV2 as jest.Mock).mockReturnValue({
      data: ticket,
      error: null,
      isLoading: false,
    });
    for (const hook of [
      useAddCustomerMessageV2,
      useRateCustomerTicketV2,
      useTransitionCustomerTicketV2,
    ]) {
      (hook as jest.Mock).mockReturnValue({
        error: null,
        isPending: false,
        mutate: jest.fn(),
      });
    }
  });

  it("shows the related ticket identifier and Persian subject", () => {
    render(<CustomerTicketDetail />);

    expect(screen.getByText("موضوع مرتبط")).toBeInTheDocument();
    expect(
      screen.getByText("TK-DEMO-0004 — پیگیری تسویه فروش برق مرداد")
    ).toBeInTheDocument();
    expect(screen.getByText("محدوده درخواست")).toBeInTheDocument();
    expect(screen.queryByText("Context")).not.toBeInTheDocument();
    expect(useCustomerTicketV2).toHaveBeenCalledWith("TK-DEMO-0011", 17);
  });

  it("explains when a ticket is unavailable in the active account", () => {
    (useCustomerTicketV2 as jest.Mock).mockReturnValueOnce({
      data: null,
      error: new CustomerApiError("تیکت یافت نشد", 404, "NOT_FOUND", null),
      isLoading: false,
    });

    render(<CustomerTicketDetail />);

    expect(
      screen.getByText("این درخواست در حساب فعال فعلی قابل مشاهده نیست")
    ).toBeInTheDocument();
    expect(screen.getByText(/حساب فعال: علی احمدی/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "مشاهده درخواست‌های حساب فعال" })
    ).toBeInTheDocument();
  });
});
