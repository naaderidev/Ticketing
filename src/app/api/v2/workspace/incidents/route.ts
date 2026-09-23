import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import {
  createWorkspaceIncident,
  listWorkspaceIncidents,
} from "@/modules/incidents/application/incident-service";
import { createIncidentSchema } from "@/modules/incidents/contracts/incident-schemas";
import { isIncidentError } from "@/modules/incidents/domain/incident-error";
import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import { apiV2Error, apiV2ListSuccess, apiV2Success, handleApiV2Error } from "@/modules/shared/api-v2-response";
import { parseApiV2Json } from "@/modules/shared/api-v2-validation";

export async function GET(request: Request) {
  try {
    const auth = await requireWorkspaceApiV2User(request);
    if (!auth.authorized) return auth.response;
    const incidents = await listWorkspaceIncidents(auth.user);
    return apiV2ListSuccess(request, incidents, { nextCursor: null, hasMore: false, limit: 100 });
  } catch (error) {
    if (isIncidentError(error)) return apiV2Error(request, error.message, error.status, error.code);
    return handleApiV2Error(request, error, "خطا در دریافت رخدادهای عمومی", "GET /api/v2/workspace/incidents");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireWorkspaceApiV2User(request, { rateLimit: AUTHENTICATED_MUTATION_LIMIT });
    if (!auth.authorized) return auth.response;
    const body = await parseApiV2Json(request, createIncidentSchema);
    if (!body.success) return body.response;
    return apiV2Success(request, await createWorkspaceIncident(auth.user, body.data), { status: 201 });
  } catch (error) {
    if (isIncidentError(error)) return apiV2Error(request, error.message, error.status, error.code);
    return handleApiV2Error(request, error, "خطا در ایجاد رخداد عمومی", "POST /api/v2/workspace/incidents");
  }
}
