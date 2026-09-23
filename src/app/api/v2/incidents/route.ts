import { listCustomerIncidents } from "@/modules/incidents/application/incident-service";
import { isIncidentError } from "@/modules/incidents/domain/incident-error";
import { requireApiV2User } from "@/modules/shared/api-v2-authorization";
import { apiV2Error, apiV2ListSuccess, handleApiV2Error } from "@/modules/shared/api-v2-response";

export async function GET(request: Request) {
  try {
    const auth = await requireApiV2User(request);
    if (!auth.authorized) return auth.response;
    const incidents = await listCustomerIncidents(auth.user);
    return apiV2ListSuccess(request, incidents, { nextCursor: null, hasMore: false, limit: 20 });
  } catch (error) {
    if (isIncidentError(error)) return apiV2Error(request, error.message, error.status, error.code);
    return handleApiV2Error(request, error, "خطا در دریافت اطلاعیه‌های عمومی", "GET /api/v2/incidents");
  }
}
