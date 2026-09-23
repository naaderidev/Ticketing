import { GET } from "@/app/api/attachments/[attachmentId]/route";
import { requireAuthenticatedUser } from "@/lib/api-authorization";
import { hasTicketPermission } from "@/lib/authorization-policy";
import {
  getAttachmentForDownload,
  readAttachmentContent,
} from "@/lib/attachment-service";

jest.mock("@/lib/api-authorization", () => ({
  requireAuthenticatedUser: jest.fn(),
}));

jest.mock("@/lib/authorization-policy", () => ({
  hasTicketPermission: jest.fn(),
}));

jest.mock("@/lib/attachment-service", () => ({
  getAttachmentForDownload: jest.fn(),
  readAttachmentContent: jest.fn(),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({
      status: init?.status || 200,
      json: () => Promise.resolve(body),
    })),
  },
}));

const authenticatedUser = {
  id: 7,
  mobile: "09120000000",
  firstName: "کاربر",
  lastName: "مالک",
  role: "USER" as const,
  sessionId: "4f1cd431-0dbf-4c2d-854c-1de9d6058208",
};

const attachment = {
  id: 42,
  fileName: "private.pdf",
  fileSize: 9,
  fileType: "application/pdf",
  storageKey: "attachments/7/private",
  checksum: null,
  fileUrl: null,
  ticket: { id: 10, ticketId: "TK-1", userId: 7, status: "OPEN" as const },
  reply: null,
};

describe("private attachment download", () => {
  beforeEach(() => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({
      authorized: true,
      value: authenticatedUser,
    });
    (getAttachmentForDownload as jest.Mock).mockResolvedValue(attachment);
  });

  it("returns not found without reading storage when the actor lacks ticket access", async () => {
    (hasTicketPermission as jest.Mock).mockReturnValue(false);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ attachmentId: "42" }),
    });

    expect(response.status).toBe(404);
    expect(readAttachmentContent).not.toHaveBeenCalled();
  });

  it("reads private storage only after ticket-level authorization", async () => {
    (hasTicketPermission as jest.Mock).mockReturnValue(true);
    (readAttachmentContent as jest.Mock).mockResolvedValue(
      Buffer.from("%PDF-1.7")
    );

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ attachmentId: "42" }),
    });

    expect(response.status).toBe(200);
    expect(hasTicketPermission).toHaveBeenCalledWith(
      authenticatedUser,
      attachment.ticket,
      "read"
    );
    expect(readAttachmentContent).toHaveBeenCalledWith(attachment);
  });

  it("rejects invalid attachment identifiers before querying storage metadata", async () => {
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ attachmentId: "../42" }),
    });

    expect(response.status).toBe(400);
    expect(getAttachmentForDownload).not.toHaveBeenCalled();
  });
});
