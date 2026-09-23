import { GET } from "@/app/api/v2/knowledge/articles/route";
import { listCustomerKnowledgeArticles } from "@/modules/knowledge/application/customer-knowledge-service";
import { requireAutomatedResolutionApiV2User } from "@/modules/shared/api-v2-authorization";

jest.mock("@/modules/knowledge/application/customer-knowledge-service", () => ({
  listCustomerKnowledgeArticles: jest.fn(),
}));
jest.mock("@/modules/shared/api-v2-authorization", () => ({
  requireAutomatedResolutionApiV2User: jest.fn(),
}));

const user = {
  id: 9,
  mobile: "09120000103",
  firstName: "علی",
  lastName: "احمدی",
  role: "USER",
  sessionId: "379bb0d9-282e-4674-b087-ab738ccd009d",
};

describe("customer knowledge article API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAutomatedResolutionApiV2User as jest.Mock).mockResolvedValue({
      authorized: true,
      user,
    });
    (listCustomerKnowledgeArticles as jest.Mock).mockResolvedValue([]);
  });

  it("returns only the customer-safe search result contract", async () => {
    const request = new Request(
      "http://localhost/api/v2/knowledge/articles?q=پرداخت&limit=6"
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(listCustomerKnowledgeArticles).toHaveBeenCalledWith({
      user,
      query: { q: "پرداخت", limit: 6 },
    });
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        data: [],
        page: { nextCursor: null, hasMore: false, limit: 6 },
      })
    );
  });

  it("rejects oversized search input before querying storage", async () => {
    const request = new Request(
      `http://localhost/api/v2/knowledge/articles?q=${"x".repeat(101)}`
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(listCustomerKnowledgeArticles).not.toHaveBeenCalled();
  });

  it("returns the authorization response without reading articles", async () => {
    (requireAutomatedResolutionApiV2User as jest.Mock).mockResolvedValueOnce({
      authorized: false,
      response: new Response(null, { status: 401 }),
    });
    const response = await GET(
      new Request("http://localhost/api/v2/knowledge/articles")
    );

    expect(response.status).toBe(401);
    expect(listCustomerKnowledgeArticles).not.toHaveBeenCalled();
  });
});
