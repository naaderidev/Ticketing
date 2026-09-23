import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import { apiV2Success, handleApiV2Error } from "@/modules/shared/api-v2-response";
import { getWorkspaceSlaSummary } from "@/modules/tickets/application/workspace-ticket-service";

export async function GET(request: Request) {
  try {
    const auth = await requireWorkspaceApiV2User(request);
    if (!auth.authorized) return auth.response;
    const summary = await getWorkspaceSlaSummary(auth.user.id);
    return apiV2Success(request, summary);
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت خلاصه SLA",
      "GET /api/v2/workspace/tickets/sla-summary"
    );
  }
}
