import { getCompanySupportOverview } from "@/modules/organizations/application/company-support-service";
import { requireOrganizationApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";

export async function GET(request: Request) {
  try {
    const auth = await requireOrganizationApiV2User(request);
    if (!auth.authorized) return auth.response;
    return apiV2Success(request, await getCompanySupportOverview(auth.user));
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت نمای پشتیبانی شرکت",
      "GET /api/v2/me/company-support"
    );
  }
}
