import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { WorkspaceTicketDetail } from "@/components/workspace-v2/workspace-ticket-detail";
import { useUser } from "@/contexts/user-context";
import { useWorkspaceCommand, useWorkspacePredefinedMessages, useWorkspaceQueues, useWorkspaceRootCauses, useWorkspaceTicket } from "@/hooks";
import type { WorkspaceTicket } from "@/types/workspace-ticket-v2";

jest.mock("@/contexts/user-context", () => ({ useUser: jest.fn() }));
jest.mock("@/hooks", () => ({
  useWorkspaceCommand: jest.fn(),
  useWorkspacePredefinedMessages: jest.fn(),
  useWorkspaceQueues: jest.fn(),
  useWorkspaceRootCauses: jest.fn(),
  useWorkspaceTicket: jest.fn(),
}));
jest.mock("@/components/shared/file-upload", () => ({ FileUpload: () => null }));

const ticket: WorkspaceTicket = {
  ticketId: "TK-TEST-STATE",
  subject: "تست استقلال ورودی‌ها",
  status: "IN_PROGRESS",
  priority: "HIGH",
  version: 1,
  requestType: {
    code: "APP_ERROR",
    name: "خطای اپلیکیشن",
    requiresRootCause: true,
    service: { code: "IDENTITY_ACCESS", name: "حساب کاربری و اپلیکیشن" },
  },
  supportTeam: { id: 1, code: "TECHNICAL", name: "فنی" },
  queue: { id: 1, code: "APP_ERRORS", name: "خطاهای اپلیکیشن" },
  owner: null,
  capabilities: {
    assign: true,
    transfer: true,
    reply: true,
    internalNote: true,
    requestCustomerInput: true,
    resolve: true,
    changePriority: true,
    collaborate: true,
    merge: true,
  },
  sla: null,
  createdAt: "2026-09-14T08:00:00.000Z",
  updatedAt: "2026-09-14T08:00:00.000Z",
  customer: { id: 2, displayName: "علی احمدی", type: "PERSON" },
  organization: null,
  organizationRole: null,
  normalizedRootCause: null,
  rootCause: null,
  resolutionSummary: null,
  actionTaken: null,
  finalResponse: null,
  rating: 5,
  messages: [],
  assignments: [],
  workItems: [
    {
      id: "101",
      request: "بررسی فنی اول",
      response: null,
      status: "OPEN",
      createdAt: "2026-09-14T08:00:00.000Z",
      completedAt: null,
      supportTeam: { id: 1, name: "فنی" },
      queue: { id: 1, name: "خطاهای اپلیکیشن" },
      assignedUser: null,
      requestedBy: { id: 1, name: "بهاره نادری" },
      capabilities: { complete: true, cancel: true },
    },
    {
      id: "102",
      request: "بررسی فنی دوم",
      response: null,
      status: "OPEN",
      createdAt: "2026-09-14T08:00:00.000Z",
      completedAt: null,
      supportTeam: { id: 2, name: "حقوقی" },
      queue: { id: 2, name: "بررسی قرارداد" },
      assignedUser: null,
      requestedBy: { id: 1, name: "بهاره نادری" },
      capabilities: { complete: true, cancel: true },
    },
  ],
  businessReferences: [],
  customerHistory: [],
  mergedInto: null,
  mergedTickets: [],
  resolutionCycle: null,
};

describe("WorkspaceTicketDetail form state", () => {
  beforeEach(() => {
    (useUser as jest.Mock).mockReturnValue({ user: { id: 1 } });
    (useWorkspaceTicket as jest.Mock).mockReturnValue({
      data: ticket,
      error: null,
      isLoading: false,
      refetch: jest.fn(),
    });
    (useWorkspaceQueues as jest.Mock).mockReturnValue({ data: [], error: null });
    (useWorkspaceRootCauses as jest.Mock).mockReturnValue({
      data: [{ id: 1, code: "APP_FRONTEND_DEFECT", name: "خطای رابط کاربری", serviceCode: "IDENTITY_ACCESS" }],
      error: null,
    });
    (useWorkspacePredefinedMessages as jest.Mock).mockReturnValue({
      data: [
        {
          id: 11,
          title: "در حال بررسی",
          content: "درخواست شما در حال بررسی است.",
          shortCode: "reviewing",
          category: "عمومی",
        },
        {
          id: 12,
          title: "درخواست اطلاعات تکمیلی",
          content: "لطفاً اطلاعات فنی تکمیلی را ارسال کنید.",
          shortCode: "technical-details",
          category: "امور فنی",
        },
      ],
      error: null,
      isLoading: false,
    });
    (useWorkspaceCommand as jest.Mock).mockReturnValue({
      isPending: false,
      mutateAsync: jest.fn(),
    });
  });

  it("keeps assignment, transfer, and priority reasons independent", () => {
    render(<WorkspaceTicketDetail ticketId={ticket.ticketId} />);

    const assignmentReason = screen.getByPlaceholderText("دلیل تخصیص");
    const transferReason = screen.getByPlaceholderText("دلیل انتقال");
    const priorityReason = screen.getByPlaceholderText("دلیل تغییر");

    fireEvent.change(priorityReason, { target: { value: "افزایش اثر کسب‌وکاری" } });

    expect(priorityReason).toHaveValue("افزایش اثر کسب‌وکاری");
    expect(assignmentReason).toHaveValue("");
    expect(transferReason).toHaveValue("");
  });

  it("keeps each open work-item response independent", () => {
    render(<WorkspaceTicketDetail ticketId={ticket.ticketId} />);
    const responses = screen.getAllByPlaceholderText("نتیجه همکاری یا دلیل لغو");

    fireEvent.change(responses[0], { target: { value: "نتیجه فقط برای همکاری اول" } });

    expect(responses[0]).toHaveValue("نتیجه فقط برای همکاری اول");
    expect(responses[1]).toHaveValue("");
  });

  it("keeps resolution and merge inputs independent", () => {
    render(<WorkspaceTicketDetail ticketId={ticket.ticketId} />);

    const actionTaken = screen.getByLabelText("اقدام انجام‌شده");
    const finalResponse = screen.getByLabelText("پاسخ نهایی به مشتری");
    const mergeReason = screen.getByPlaceholderText("دلیل ادغام");

    fireEvent.change(actionTaken, { target: { value: "پاک‌سازی نشست‌های قدیمی" } });

    expect(actionTaken).toHaveValue("پاک‌سازی نشست‌های قدیمی");
    expect(finalResponse).toHaveValue("");
    expect(mergeReason).toHaveValue("");
  });

  it("shows the customer rating in the support workspace", () => {
    render(<WorkspaceTicketDetail ticketId={ticket.ticketId} />);

    expect(screen.getByText("امتیاز مشتری")).toBeInTheDocument();
    expect(screen.getByText("۵ از ۵")).toBeInTheDocument();
    expect(screen.getByLabelText("امتیاز مشتری 5 از ۵")).toBeInTheDocument();
    expect(screen.getByTestId("star-rating")).toBeInTheDocument();
  });

  it("inserts a predefined message into the workspace composer", () => {
    render(<WorkspaceTicketDetail ticketId={ticket.ticketId} />);

    fireEvent.click(screen.getByLabelText("انتخاب دسته‌بندی پاسخ آماده"));
    fireEvent.click(screen.getByText("امور فنی"));
    fireEvent.click(screen.getByLabelText("انتخاب پاسخ آماده"));
    const messageOptions = within(screen.getByRole("listbox"));
    expect(messageOptions.queryByText("در حال بررسی")).not.toBeInTheDocument();
    fireEvent.click(messageOptions.getByText("درخواست اطلاعات تکمیلی"));

    expect(screen.getByLabelText("متن ارتباط")).toHaveValue(
      "لطفاً اطلاعات فنی تکمیلی را ارسال کنید."
    );
  });
});
