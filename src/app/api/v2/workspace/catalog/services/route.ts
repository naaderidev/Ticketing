import { recordAuditEvent } from "@/lib/audit-log";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { createSupportService } from "@/modules/support-catalog/application/support-catalog-service";
import { createSupportServiceSchema } from "@/modules/support-catalog/contracts/support-catalog-schemas";
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

    const body = await parseApiV2Json(request, createSupportServiceSchema);
    if (!body.success) return body.response;
    const service = await createSupportService(auth.user.id, body.data);
    await recordAuditEvent({
      request,
      action: "SUPPORT_SERVICE_CREATE",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      targetType: "SUPPORT_SERVICE",
      targetId: String(service.id),
    });
    return apiV2Success(request, service, { status: 201 });
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در ایجاد خدمت پشتیبانی",
      "POST /api/v2/workspace/catalog/services"
    );
  }
}
