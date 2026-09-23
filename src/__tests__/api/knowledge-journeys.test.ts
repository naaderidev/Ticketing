import { POST as startJourney } from "@/app/api/v2/knowledge/journeys/route";
import { POST as confirmResolution } from "@/app/api/v2/knowledge/journeys/[journeyId]/confirm-resolution/route";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  confirmKnowledgeResolution,
  startKnowledgeJourney,
} from "@/modules/knowledge/application/support-journey-service";
import { requireAutomatedResolutionApiV2User } from "@/modules/shared/api-v2-authorization";

jest.mock("@/lib/audit-log", () => ({ recordAuditEvent: jest.fn() }));
jest.mock("@/modules/knowledge/application/support-journey-service", () => ({
  startKnowledgeJourney: jest.fn(),
  confirmKnowledgeResolution: jest.fn(),
}));
jest.mock("@/modules/shared/api-v2-authorization", () => ({
  requireAutomatedResolutionApiV2User: jest.fn(),
}));

const user = {
  id: 7,
  mobile: "09120000000",
  firstName: "کاربر",
  lastName: "آزمایشی",
  role: "USER",
  sessionId: "379bb0d9-282e-4674-b087-ab738ccd009d",
};

describe("knowledge journey API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAutomatedResolutionApiV2User as jest.Mock).mockResolvedValue({
      authorized: true,
      user,
    });
    (recordAuditEvent as jest.Mock).mockResolvedValue(undefined);
  });

  it("starts an eligible journey idempotently", async () => {
    (startKnowledgeJourney as jest.Mock).mockResolvedValue({
      journey: { id: "201b3f18-8e95-43a6-b7f8-d13c97a03cd3" },
      article: { id: 4 },
      replayed: false,
    });
    const request = new Request("http://localhost/api/v2/knowledge/journeys", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "journey-start-key-0001",
      },
      body: JSON.stringify({ articleId: 4 }),
    });
    const response = await startJourney(request);
    expect(response.status).toBe(201);
    expect(startKnowledgeJourney).toHaveBeenCalledWith({
      user,
      articleId: 4,
      idempotencyKey: "journey-start-key-0001",
    });
  });

  it("rejects an invalid journey path before mutation", async () => {
    const request = new Request(
      "http://localhost/api/v2/knowledge/journeys/not-a-uuid/confirm-resolution",
      {
        method: "POST",
        headers: { "idempotency-key": "journey-confirm-key-001" },
        body: "{}",
      }
    );
    const response = await confirmResolution(request, {
      params: Promise.resolve({ journeyId: "not-a-uuid" }),
    });
    expect(response.status).toBe(400);
    expect(confirmKnowledgeResolution).not.toHaveBeenCalled();
  });

  it("records explicit resolution confirmation", async () => {
    const journeyId = "201b3f18-8e95-43a6-b7f8-d13c97a03cd3";
    (confirmKnowledgeResolution as jest.Mock).mockResolvedValue({
      journey: { id: journeyId, status: "CONFIRMED_RESOLVED" },
      replayed: true,
    });
    const request = new Request(
      `http://localhost/api/v2/knowledge/journeys/${journeyId}/confirm-resolution`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "journey-confirm-key-001",
        },
        body: "{}",
      }
    );
    const response = await confirmResolution(request, {
      params: Promise.resolve({ journeyId }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("idempotency-replayed")).toBe("true");
    expect(confirmKnowledgeResolution).toHaveBeenCalledWith({
      user,
      journeyId,
      idempotencyKey: "journey-confirm-key-001",
    });
  });
});
