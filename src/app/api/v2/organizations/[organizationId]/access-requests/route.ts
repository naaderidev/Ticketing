import { recordAuditEvent } from "@/lib/audit-log";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import {
  createOrganizationAccessRequest,
  listOrganizationAccessRequests,
} from "@/modules/organizations/application/organization-service";
import { organizationAccessRequestSchema } from "@/modules/organizations/contracts/organization-schemas";
import { requireOrganizationApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import {
  parseApiV2Json,
  parseApiV2PositiveInteger,
} from "@/modules/shared/api-v2-validation";

type RouteParams = { params: Promise<{ organizationId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireOrganizationApiV2User(request);
    if (!auth.authorized) return auth.response;
    const parsedId = parseApiV2PositiveInteger(
      request,
      (await params).organizationId,
      "شناسه سازمان"
    );
    if (!parsedId.success) return parsedId.response;

    const accessRequests = await listOrganizationAccessRequests({
      actorUserId: auth.user.id,
      organizationId: parsedId.data,
    });
    await recordAuditEvent({
      request,
      action: "ORGANIZATION_ACCESS_REQUEST_VIEW",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      organizationId: parsedId.data,
      targetType: "ORGANIZATION",
      targetId: String(parsedId.data),
    });
    return apiV2Success(request, accessRequests);
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت درخواست‌های دسترسی",
      "GET /api/v2/organizations/:id/access-requests"
    );
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireOrganizationApiV2User(request, {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;
    const parsedId = parseApiV2PositiveInteger(
      request,
      (await params).organizationId,
      "شناسه سازمان"
    );
    if (!parsedId.success) return parsedId.response;
    const body = await parseApiV2Json(request, organizationAccessRequestSchema);
    if (!body.success) return body.response;

    const accessRequest = await createOrganizationAccessRequest(
      auth.user.id,
      parsedId.data,
      body.data
    );
    await recordAuditEvent({
      request,
      action: "ORGANIZATION_ACCESS_REQUEST_CREATE",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      organizationId: parsedId.data,
      targetType: "ORGANIZATION_ACCESS_REQUEST",
      targetId: String(accessRequest.id),
      metadata: { requestType: accessRequest.requestType },
    });
    return apiV2Success(request, accessRequest, { status: 201 });
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در ثبت درخواست دسترسی",
      "POST /api/v2/organizations/:id/access-requests"
    );
  }
}
