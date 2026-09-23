import { recordAuditEvent } from "@/lib/audit-log";
import { getSupportTeamMemberCandidates } from "@/modules/support-catalog/application/support-catalog-service";
import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";

export async function GET(request: Request) {
  try {
    const auth = await requireWorkspaceApiV2User(request);
    if (!auth.authorized) return auth.response;

    const candidates = await getSupportTeamMemberCandidates(auth.user.id);
    await recordAuditEvent({
      request,
      action: "SUPPORT_TEAM_MEMBER_CANDIDATES_VIEW",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      targetType: "SUPPORT_TEAM",
    });
    return apiV2Success(request, candidates);
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت کاربران قابل تخصیص",
      "GET /api/v2/workspace/support-team-member-candidates",
    );
  }
}
