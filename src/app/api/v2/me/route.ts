import { requireOrganizationApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import { getPartyContextSnapshot } from "@/modules/organizations/application/party-context-service";

export async function GET(request: Request) {
  try {
    const auth = await requireOrganizationApiV2User(request);
    if (!auth.authorized) return auth.response;

    const context = await getPartyContextSnapshot(auth.user);
    return apiV2Success(request, {
      actor: {
        id: auth.user.id,
        firstName: auth.user.firstName,
        lastName: auth.user.lastName,
        mobile: auth.user.mobile,
        legacyRole: auth.user.role,
      },
      activePartyId: context.activePartyId,
      contexts: context.contexts,
    });
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت اطلاعات کاربر",
      "GET /api/v2/me"
    );
  }
}
