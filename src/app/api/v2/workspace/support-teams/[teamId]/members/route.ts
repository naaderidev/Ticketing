import { recordAuditEvent } from "@/lib/audit-log";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { assignSupportTeamMember } from "@/modules/support-catalog/application/support-catalog-service";
import { assignSupportTeamMemberSchema } from "@/modules/support-catalog/contracts/support-catalog-schemas";
import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import {
  parseApiV2Json,
  parseApiV2PositiveInteger,
} from "@/modules/shared/api-v2-validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const auth = await requireWorkspaceApiV2User(request, {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;

    const teamId = parseApiV2PositiveInteger(
      request,
      (await params).teamId,
      "شناسه تیم"
    );
    if (!teamId.success) return teamId.response;
    const body = await parseApiV2Json(
      request,
      assignSupportTeamMemberSchema
    );
    if (!body.success) return body.response;

    const assignment = await assignSupportTeamMember(
      auth.user.id,
      teamId.data,
      body.data
    );
    await recordAuditEvent({
      request,
      action: "SUPPORT_TEAM_MEMBER_ASSIGN",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      targetType: "SUPPORT_TEAM",
      targetId: String(teamId.data),
      metadata: {
        assignedUserId: body.data.userId,
        roleKey: body.data.roleKey,
      },
    });
    return apiV2Success(request, assignment, { status: 201 });
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در تخصیص عضو تیم",
      "POST /api/v2/workspace/support-teams/:id/members"
    );
  }
}
