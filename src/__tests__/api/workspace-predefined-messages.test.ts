import { getMessages } from "@/lib/message-service";
import {
  hasAnySupportPermission,
  SUPPORT_PERMISSIONS,
} from "@/modules/support-catalog/application/support-authorization";
import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Error,
  apiV2Success,
} from "@/modules/shared/api-v2-response";

jest.mock("@/lib/message-service", () => ({ getMessages: jest.fn() }));
jest.mock("@/modules/support-catalog/application/support-authorization", () => ({
  hasAnySupportPermission: jest.fn(),
  SUPPORT_PERMISSIONS: {
    WORKSPACE_ACCESS: "support.workspace.access",
    TICKET_REPLY: "ticket.workspace.reply",
  },
}));
jest.mock("@/modules/shared/api-v2-authorization", () => ({
  requireWorkspaceApiV2User: jest.fn(),
}));
jest.mock("@/modules/shared/api-v2-response", () => ({
  apiV2Error: jest.fn((_request, message, status, code) => ({
    status,
    body: { error: { message, code } },
  })),
  apiV2Success: jest.fn((_request, data) => ({ status: 200, body: { data } })),
  handleApiV2Error: jest.fn(),
}));

describe("workspace predefined messages route", () => {
  beforeEach(() => {
    (requireWorkspaceApiV2User as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 7 },
    });
    (hasAnySupportPermission as jest.Mock).mockResolvedValue(true);
  });

  it("returns mapped messages to staff with workspace and reply permissions", async () => {
    (getMessages as jest.Mock).mockResolvedValue([
      {
        id: 3,
        title: "شروع بررسی",
        content: "درخواست شما در حال بررسی است.",
        shortCode: "reviewing",
        subDepartment: null,
      },
    ]);
    const { GET } = await import(
      "@/app/api/v2/workspace/predefined-messages/route"
    );
    const request = new Request("http://localhost/api/v2/workspace/predefined-messages");

    const response = await GET(request);

    expect(hasAnySupportPermission).toHaveBeenCalledWith(
      7,
      SUPPORT_PERMISSIONS.WORKSPACE_ACCESS
    );
    expect(hasAnySupportPermission).toHaveBeenCalledWith(
      7,
      SUPPORT_PERMISSIONS.TICKET_REPLY
    );
    expect(apiV2Success).toHaveBeenCalledWith(request, [
      {
        id: 3,
        title: "شروع بررسی",
        content: "درخواست شما در حال بررسی است.",
        shortCode: "reviewing",
        category: "عمومی",
      },
    ]);
    expect(response.status).toBe(200);
  });

  it("does not expose prepared messages without reply permission", async () => {
    (hasAnySupportPermission as jest.Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const { GET } = await import(
      "@/app/api/v2/workspace/predefined-messages/route"
    );
    const request = new Request("http://localhost/api/v2/workspace/predefined-messages");

    const response = await GET(request);

    expect(apiV2Error).toHaveBeenCalledWith(
      request,
      "دسترسی به پاسخ‌های آماده مجاز نیست",
      403,
      "FORBIDDEN"
    );
    expect(getMessages).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });
});
