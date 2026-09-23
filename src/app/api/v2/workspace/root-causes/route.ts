import { listWorkspaceRootCauses } from "@/modules/tickets/application/workspace-ticket-service";
import { workspaceRootCauseQuerySchema } from "@/modules/tickets/contracts/workspace-ticket-schemas";
import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import { apiV2Success, handleApiV2Error } from "@/modules/shared/api-v2-response";
import { parseApiV2Query } from "@/modules/shared/api-v2-validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requireWorkspaceApiV2User(request);
    if (!auth.authorized) return auth.response;
    const query = parseApiV2Query(
      request,
      new URL(request.url).searchParams,
      workspaceRootCauseQuerySchema
    );
    if (!query.success) return query.response;
    return apiV2Success(
      request,
      await listWorkspaceRootCauses({ actorUserId: auth.user.id, query: query.data })
    );
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت علت‌های ریشه‌ای استاندارد",
      "GET /api/v2/workspace/root-causes"
    );
  }
}
