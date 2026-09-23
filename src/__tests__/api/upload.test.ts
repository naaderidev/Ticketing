import { POST } from "@/app/api/upload/route";
import { requireAuthenticatedUser } from "@/lib/api-authorization";
import { createPendingUpload } from "@/lib/attachment-service";

jest.mock("@/lib/api-authorization", () => ({
  requireAuthenticatedUser: jest.fn(),
}));

jest.mock("@/lib/attachment-service", () => ({
  createPendingUpload: jest.fn(),
}));

jest.mock("@/lib/audit-log", () => ({
  recordAuditEvent: jest.fn(),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({
      status: init?.status || 200,
      json: () => Promise.resolve(body),
    })),
  },
}));

describe("attachment upload API", () => {
  beforeEach(() => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({
      authorized: true,
      value: {
        id: 7,
        sessionId: "7292640d-ac55-4120-993e-879ec9aecb22",
      },
    });
  });

  it("rejects an empty file before invoking storage", async () => {
    const formData = new FormData();
    formData.set("file", new File([], "empty.txt", { type: "text/plain" }));
    const request = {
      headers: new Headers(),
      formData: jest.fn().mockResolvedValue(formData),
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "فایل خالی مجاز نیست",
      code: "INVALID_REQUEST",
    });
    expect(createPendingUpload).not.toHaveBeenCalled();
  });
});
