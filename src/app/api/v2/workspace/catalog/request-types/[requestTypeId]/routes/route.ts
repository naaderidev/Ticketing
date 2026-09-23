import { recordAuditEvent } from "@/lib/audit-log";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { publishSupportCatalogRoute } from "@/modules/support-catalog/application/support-catalog-service";
import { publishSupportRouteSchema } from "@/modules/support-catalog/contracts/support-catalog-schemas";
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
  { params }: { params: Promise<{ requestTypeId: string }> }
) {
  try {
    const auth = await requireWorkspaceApiV2User(request, {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;

    const requestTypeId = parseApiV2PositiveInteger(
      request,
      (await params).requestTypeId,
      "شناسه نوع درخواست"
    );
    if (!requestTypeId.success) return requestTypeId.response;
    const body = await parseApiV2Json(request, publishSupportRouteSchema);
    if (!body.success) return body.response;

    const route = await publishSupportCatalogRoute(
      auth.user.id,
      requestTypeId.data,
      body.data
    );
    await recordAuditEvent({
      request,
      action: "SUPPORT_CATALOG_ROUTE_PUBLISH",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      targetType: "SUPPORT_REQUEST_TYPE",
      targetId: String(requestTypeId.data),
      metadata: {
        queueId: body.data.queueId,
        routeVersion: route.version,
        reason: body.data.reason,
      },
    });
    return apiV2Success(request, route, { status: 201 });
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در انتشار مسیر کاتالوگ",
      "POST /api/v2/workspace/catalog/request-types/:id/routes"
    );
  }
}
