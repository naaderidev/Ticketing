import { recordAuditEvent } from "@/lib/audit-log";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { approveOrganizationAccessRequest } from "@/modules/organizations/application/organization-service";
import { organizationAccessDecisionSchema } from "@/modules/organizations/contracts/organization-schemas";
import { requireOrganizationApiV2User } from "@/modules/shared/api-v2-authorization";
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
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const auth = await requireOrganizationApiV2User(request, {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;
    const parsedId = parseApiV2PositiveInteger(
      request,
      (await params).requestId,
      "شناسه درخواست"
    );
    if (!parsedId.success) return parsedId.response;
    const body = await parseApiV2Json(request, organizationAccessDecisionSchema);
    if (!body.success) return body.response;

    const result = await approveOrganizationAccessRequest({
      actorUserId: auth.user.id,
      requestId: parsedId.data,
      decisionReason: body.data.reason,
    });
    await recordAuditEvent({
      request,
      action: "ORGANIZATION_ACCESS_REQUEST_APPROVE",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      organizationId: result.organizationId,
      targetType: "ORGANIZATION_ACCESS_REQUEST",
      targetId: String(result.id),
    });
    return apiV2Success(request, result);
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در تأیید درخواست دسترسی",
      "POST /api/v2/access-requests/:id/approve"
    );
  }
}
