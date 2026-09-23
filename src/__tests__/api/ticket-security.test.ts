import {
  addReply,
  getTicketByTicketId,
  updateTicket,
} from "@/lib/ticket-service";
import { requireTicketPermission } from "@/lib/api-authorization";

jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({
      status: init?.status || 200,
      json: () => Promise.resolve(body),
    })),
  },
}));

jest.mock("@/lib/ticket-service", () => ({
  addReply: jest.fn(),
  getTicketByTicketId: jest.fn(),
  updateTicket: jest.fn(),
}));

jest.mock("@/lib/api-authorization", () => ({
  requireTicketPermission: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    ticketReply: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/audit-log", () => ({
  recordAuditEvent: jest.fn(),
}));

const ownerAccess = {
  authorized: true as const,
  value: {
    user: {
      id: 7,
      mobile: "09120000000",
      firstName: "کاربر",
      lastName: "مالک",
      role: "USER" as const,
      sessionId: "4f1cd431-0dbf-4c2d-854c-1de9d6058208",
    },
    ticket: {
      id: 10,
      ticketId: "TK-SECURITY",
      userId: 7,
      status: "OPEN" as const,
    },
  },
};

describe("ticket route authorization", () => {
  beforeEach(() => {
    (requireTicketPermission as jest.Mock).mockResolvedValue(ownerAccess);
  });

  it("does not read a ticket when access is denied", async () => {
    (requireTicketPermission as jest.Mock).mockResolvedValueOnce({
      authorized: false,
      response: {
        status: 404,
        json: () => Promise.resolve({ error: "تیکت یافت نشد" }),
      },
    });

    const { GET } = await import("@/app/api/tickets/[ticketId]/route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ ticketId: "TK-OTHER" }),
    });

    expect(response.status).toBe(404);
    expect(getTicketByTicketId).not.toHaveBeenCalled();
  });

  it("prevents a normal user from changing workflow state", async () => {
    const request = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });

    const { PUT } = await import("@/app/api/tickets/[ticketId]/route");
    const response = await PUT(request, {
      params: Promise.resolve({ ticketId: "TK-SECURITY" }),
    });

    expect(response.status).toBe(403);
    expect(updateTicket).not.toHaveBeenCalled();
  });

  it("blocks operational ticket deletion after authorization", async () => {
    const { DELETE } = await import("@/app/api/tickets/[ticketId]/route");
    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ ticketId: "TK-SECURITY" }),
    });

    expect(requireTicketPermission).toHaveBeenCalledWith(
      "TK-SECURITY",
      "delete",
      expect.objectContaining({ rateLimit: expect.any(Object) })
    );
    expect(response.status).toBe(409);
  });

  it("rejects client-supplied reply identity fields", async () => {
    (addReply as jest.Mock).mockResolvedValue({ id: 1 });
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        message: "پاسخ",
        senderType: "ADMIN",
        senderName: "مدیر جعلی",
      }),
    });

    const { POST } = await import(
      "@/app/api/tickets/[ticketId]/replies/route"
    );
    const response = await POST(request, {
      params: Promise.resolve({ ticketId: "TK-SECURITY" }),
    });

    expect(response.status).toBe(400);
    expect(addReply).not.toHaveBeenCalled();
  });

  it("derives reply identity from the authenticated user", async () => {
    (addReply as jest.Mock).mockResolvedValue({ id: 1 });
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ message: "پاسخ" }),
    });

    const { POST } = await import("@/app/api/tickets/[ticketId]/replies/route");
    const response = await POST(request, {
      params: Promise.resolve({ ticketId: "TK-SECURITY" }),
    });

    expect(response.status).toBe(201);
    expect(addReply).toHaveBeenCalledWith("TK-SECURITY", {
      message: "پاسخ",
      senderType: "USER",
      senderName: "کاربر مالک",
      attachmentUploaderId: 7,
      actorUserId: 7,
    });
  });
});
