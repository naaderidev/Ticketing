import { recordAuditEvent } from "@/lib/audit-log";
import { listOrganizationMemberships } from "@/modules/organizations/application/organization-service";
import { requireOrganizationApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import { parseApiV2PositiveInteger } from "@/modules/shared/api-v2-validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  try {
    const auth = await requireOrganizationApiV2User(request);
    if (!auth.authorized) return auth.response;

    const parsedId = parseApiV2PositiveInteger(
      request,
      (await params).organizationId,
      "شناسه سازمان"
    );
    if (!parsedId.success) return parsedId.response;

    const organization = await listOrganizationMemberships({
      actorUserId: auth.user.id,
      organizationId: parsedId.data,
    });
    await recordAuditEvent({
      request,
      action: "ORGANIZATION_MEMBERSHIP_VIEW",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      organizationId: organization.id,
      activePartyId: organization.partyId,
      targetType: "ORGANIZATION",
      targetId: String(organization.id),
    });
    return apiV2Success(request, organization);
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت اعضای سازمان",
      "GET /api/v2/organizations/:id/memberships"
    );
  }
}
