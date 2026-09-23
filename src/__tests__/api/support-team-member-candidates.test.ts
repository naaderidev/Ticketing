import { recordAuditEvent } from "@/lib/audit-log";
import { getSupportTeamMemberCandidates } from "@/modules/support-catalog/application/support-catalog-service";
import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";

jest.mock("@/lib/audit-log", () => ({ recordAuditEvent: jest.fn() }));
jest.mock("@/modules/support-catalog/application/support-catalog-service", () => ({
  getSupportTeamMemberCandidates: jest.fn(),
}));
jest.mock("@/modules/shared/api-v2-authorization", () => ({
  requireWorkspaceApiV2User: jest.fn(),
}));
jest.mock("@/modules/shared/api-v2-response", () => ({
  apiV2Success: jest.fn((_request, data) => ({ status: 200, body: { data } })),
  handleApiV2Error: jest.fn(),
}));

describe("support team member candidates route", () => {
  beforeEach(() => {
    (requireWorkspaceApiV2User as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 2, sessionId: "session-2" },
    });
  });

  it("returns the permission-scoped minimal candidate list", async () => {
    const candidates = [{ id: 8, firstName: "زهرا", lastName: "رضایی" }];
    (getSupportTeamMemberCandidates as jest.Mock).mockResolvedValue(candidates);
    const { GET } = await import(
      "@/app/api/v2/workspace/support-team-member-candidates/route"
    );
    const request = new Request(
      "http://localhost/api/v2/workspace/support-team-member-candidates",
    );

    const response = await GET(request);

    expect(getSupportTeamMemberCandidates).toHaveBeenCalledWith(2);
    expect(apiV2Success).toHaveBeenCalledWith(request, candidates);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SUPPORT_TEAM_MEMBER_CANDIDATES_VIEW",
        actorUserId: 2,
      }),
    );
    expect(response.status).toBe(200);
  });

  it("passes through an authentication denial without querying candidates", async () => {
    const deniedResponse = { status: 401 };
    (requireWorkspaceApiV2User as jest.Mock).mockResolvedValue({
      authorized: false,
      response: deniedResponse,
    });
    const { GET } = await import(
      "@/app/api/v2/workspace/support-team-member-candidates/route"
    );

    await expect(
      GET(
        new Request(
          "http://localhost/api/v2/workspace/support-team-member-candidates",
        ),
      ),
    ).resolves.toBe(deniedResponse);
    expect(getSupportTeamMemberCandidates).not.toHaveBeenCalled();
    expect(handleApiV2Error).not.toHaveBeenCalled();
  });
});
