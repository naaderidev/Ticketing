import { getWorkspaceIncident } from "@/modules/incidents/application/incident-service";
import { isIncidentError } from "@/modules/incidents/domain/incident-error";
import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import { apiV2Error, apiV2Success, handleApiV2Error } from "@/modules/shared/api-v2-response";

export async function GET(request: Request, { params }: { params: Promise<{ incidentKey: string }> }) {
  try {
    const auth = await requireWorkspaceApiV2User(request);
    if (!auth.authorized) return auth.response;
    const { incidentKey } = await params;
    return apiV2Success(request, await getWorkspaceIncident(auth.user, incidentKey));
  } catch (error) {
    if (isIncidentError(error)) return apiV2Error(request, error.message, error.status, error.code);
    return handleApiV2Error(request, error, "خطا در دریافت رخداد عمومی", "GET /api/v2/workspace/incidents/:incidentKey");
  }
}
