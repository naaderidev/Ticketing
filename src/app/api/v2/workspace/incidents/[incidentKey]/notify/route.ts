import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { notifyWorkspaceIncident } from "@/modules/incidents/application/incident-service";
import { notifyIncidentSchema } from "@/modules/incidents/contracts/incident-schemas";
import { isIncidentError } from "@/modules/incidents/domain/incident-error";
import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import { apiV2Error, apiV2Success, handleApiV2Error } from "@/modules/shared/api-v2-response";
import { parseApiV2Json } from "@/modules/shared/api-v2-validation";

export async function POST(request: Request, { params }: { params: Promise<{ incidentKey: string }> }) {
  try {
    const auth = await requireWorkspaceApiV2User(request, { rateLimit: AUTHENTICATED_MUTATION_LIMIT });
    if (!auth.authorized) return auth.response;
    const body = await parseApiV2Json(request, notifyIncidentSchema);
    if (!body.success) return body.response;
    const { incidentKey } = await params;
    return apiV2Success(request, await notifyWorkspaceIncident(auth.user, incidentKey, body.data.message));
  } catch (error) {
    if (isIncidentError(error)) return apiV2Error(request, error.message, error.status, error.code);
    return handleApiV2Error(request, error, "خطا در اطلاع‌رسانی رخداد", "POST /api/v2/workspace/incidents/:incidentKey/notify");
  }
}
