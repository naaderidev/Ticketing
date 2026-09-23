import { recordAuditEvent } from "@/lib/audit-log";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { reconcileLegacyCatalogMapping } from "@/modules/support-catalog/application/support-catalog-service";
import { reconcileLegacyCatalogMappingSchema } from "@/modules/support-catalog/contracts/support-catalog-schemas";
import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import {
  parseApiV2Json,
  parseApiV2PositiveInteger,
} from "@/modules/shared/api-v2-validation";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ mappingId: string }> }
) {
  try {
    const auth = await requireWorkspaceApiV2User(request, {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;

    const mappingId = parseApiV2PositiveInteger(
      request,
      (await params).mappingId,
      "شناسه تطبیق"
    );
    if (!mappingId.success) return mappingId.response;
    const body = await parseApiV2Json(
      request,
      reconcileLegacyCatalogMappingSchema
    );
    if (!body.success) return body.response;

    const mapping = await reconcileLegacyCatalogMapping(
      auth.user.id,
      mappingId.data,
      body.data
    );
    await recordAuditEvent({
      request,
      action: "LEGACY_SUPPORT_CATALOG_MAPPING_RECONCILE",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      targetType: "LEGACY_SUPPORT_CATALOG_MAPPING",
      targetId: String(mapping.id),
      metadata: {
        sourceType: mapping.sourceType,
        status: mapping.status,
        supportServiceId: mapping.supportServiceId,
        supportRequestTypeId: mapping.supportRequestTypeId,
      },
    });
    return apiV2Success(request, mapping);
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در تطبیق داده قدیمی",
      "PATCH /api/v2/workspace/catalog/legacy-mappings/:id"
    );
  }
}
