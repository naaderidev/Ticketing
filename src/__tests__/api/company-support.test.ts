import { GET } from "@/app/api/v2/me/company-support/route";
import { getCompanySupportOverview } from "@/modules/organizations/application/company-support-service";
import { requireOrganizationApiV2User } from "@/modules/shared/api-v2-authorization";

jest.mock("@/modules/organizations/application/company-support-service", () => ({
  getCompanySupportOverview: jest.fn(),
}));
jest.mock("@/modules/shared/api-v2-authorization", () => ({
  requireOrganizationApiV2User: jest.fn(),
}));

const user = {
  id: 8,
  mobile: "09120000101",
  firstName: "زهرا",
  lastName: "رضایی",
  role: "USER",
  sessionId: "379bb0d9-282e-4674-b087-ab738ccd009d",
};

describe("company support API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireOrganizationApiV2User as jest.Mock).mockResolvedValue({
      authorized: true,
      user,
    });
  });

  it("returns the active organization support overview", async () => {
    const overview = {
      organization: { id: 4, legalName: "شرکت انرژی آفتاب" },
      branches: [],
      representatives: [],
      contracts: [],
      assets: [],
    };
    (getCompanySupportOverview as jest.Mock).mockResolvedValue(overview);

    const response = await GET(
      new Request("http://localhost/api/v2/me/company-support")
    );

    expect(response.status).toBe(200);
    expect(getCompanySupportOverview).toHaveBeenCalledWith(user);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ data: overview })
    );
  });

  it("does not read company data for an unauthenticated request", async () => {
    (requireOrganizationApiV2User as jest.Mock).mockResolvedValueOnce({
      authorized: false,
      response: new Response(null, { status: 401 }),
    });
    const response = await GET(
      new Request("http://localhost/api/v2/me/company-support")
    );

    expect(response.status).toBe(401);
    expect(getCompanySupportOverview).not.toHaveBeenCalled();
  });
});
