import { recordAuditEvent } from "@/lib/audit-log";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { activePartyContextSchema } from "@/modules/organizations/contracts/organization-schemas";
import { switchActivePartyContext } from "@/modules/organizations/application/party-context-service";
import { requireOrganizationApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import { parseApiV2Json } from "@/modules/shared/api-v2-validation";

export async function POST(request: Request) {
  try {
    const auth = await requireOrganizationApiV2User(request, {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;

    const body = await parseApiV2Json(request, activePartyContextSchema);
    if (!body.success) return body.response;

    const context = await switchActivePartyContext({
      user: auth.user,
      partyId: body.data.partyId,
    });
    await recordAuditEvent({
      request,
      action: "PARTY_CONTEXT_SWITCH",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      activePartyId: context.partyId,
      organizationId: context.organization?.id,
      targetType: "PARTY",
      targetId: String(context.partyId),
      metadata: { partyType: context.type },
    });
    return apiV2Success(request, context);
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در تغییر طرف حساب فعال",
      "POST /api/v2/me/active-context"
    );
  }
}
