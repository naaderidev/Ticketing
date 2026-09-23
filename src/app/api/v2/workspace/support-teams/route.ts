import { recordAuditEvent } from "@/lib/audit-log";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { createSupportTeam } from "@/modules/support-catalog/application/support-catalog-service";
import { createSupportTeamSchema } from "@/modules/support-catalog/contracts/support-catalog-schemas";
import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import { parseApiV2Json } from "@/modules/shared/api-v2-validation";

export async function POST(request: Request) {
  try {
    const auth = await requireWorkspaceApiV2User(request, {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;

    const body = await parseApiV2Json(request, createSupportTeamSchema);
    if (!body.success) return body.response;
    const team = await createSupportTeam(auth.user.id, body.data);
    await recordAuditEvent({
      request,
      action: "SUPPORT_TEAM_CREATE",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      targetType: "SUPPORT_TEAM",
      targetId: String(team.id),
    });
    return apiV2Success(request, team, { status: 201 });
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در ایجاد تیم پشتیبانی",
      "POST /api/v2/workspace/support-teams"
    );
  }
}
