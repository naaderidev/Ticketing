import { recordAuditEvent } from "@/lib/audit-log";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import {
  hasGlobalPermission,
  ORGANIZATION_PERMISSIONS,
} from "@/modules/organizations/application/organization-authorization";
import {
  createOrganization,
  listOrganizations,
} from "@/modules/organizations/application/organization-service";
import { createOrganizationSchema } from "@/modules/organizations/contracts/organization-schemas";
import { requireOrganizationApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Error,
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import { parseApiV2Json } from "@/modules/shared/api-v2-validation";

export async function GET(request: Request) {
  try {
    const auth = await requireOrganizationApiV2User(request);
    if (!auth.authorized) return auth.response;

    const organizations = await listOrganizations({ actorUserId: auth.user.id });
    await recordAuditEvent({
      request,
      action: "ORGANIZATION_LIST_VIEW",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      targetType: "ORGANIZATION",
      metadata: { resultCount: organizations.length },
    });
    return apiV2Success(request, organizations);
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت سازمان‌ها",
      "GET /api/v2/organizations"
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireOrganizationApiV2User(request, {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;

    const canCreate = await hasGlobalPermission(
      auth.user.id,
      ORGANIZATION_PERMISSIONS.CREATE
    );
    if (!canCreate) {
      await recordAuditEvent({
        request,
        action: "ORGANIZATION_CREATE",
        outcome: "DENIED",
        actorUserId: auth.user.id,
        sessionId: auth.user.sessionId,
      });
      return apiV2Error(request, "دسترسی غیرمجاز", 403, "FORBIDDEN");
    }

    const body = await parseApiV2Json(request, createOrganizationSchema);
    if (!body.success) return body.response;

    const organization = await createOrganization(auth.user.id, body.data);
    await recordAuditEvent({
      request,
      action: "ORGANIZATION_CREATE",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      activePartyId: organization.partyId,
      organizationId: organization.id,
      targetType: "ORGANIZATION",
      targetId: String(organization.id),
    });
    return apiV2Success(request, organization, { status: 201 });
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در ایجاد سازمان",
      "POST /api/v2/organizations"
    );
  }
}
