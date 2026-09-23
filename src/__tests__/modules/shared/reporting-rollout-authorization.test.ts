import { getCurrentUser } from "@/lib/current-user";
import { isReportingActorAllowedInRollout } from "@/lib/reporting-rollout-config";
import { requireReportingApiV2User } from "@/modules/shared/api-v2-authorization";

jest.mock("@/lib/current-user", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/feature-flags", () => ({
  isReportingApiEnabled: jest.fn(() => true),
}));
jest.mock("@/lib/reporting-rollout-config", () => ({
  isReportingActorAllowedInRollout: jest.fn(),
}));
jest.mock("@/lib/rate-limit", () => ({ consumeRateLimit: jest.fn() }));

const user = {
  id: 7,
  role: "ADMIN",
  firstName: "Test",
  lastName: "User",
};

describe("Reporting canary authorization boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
  });

  it("allows an authenticated actor selected for the canary", async () => {
    (isReportingActorAllowedInRollout as jest.Mock).mockReturnValue(true);
    await expect(
      requireReportingApiV2User(
        new Request("http://localhost/api/v2/reporting/access")
      )
    ).resolves.toEqual({ authorized: true, user });
  });

  it("hides the feature from an authenticated actor outside the canary", async () => {
    (isReportingActorAllowedInRollout as jest.Mock).mockReturnValue(false);
    const result = await requireReportingApiV2User(
      new Request("http://localhost/api/v2/reporting/access")
    );
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(404);
    }
  });
});
