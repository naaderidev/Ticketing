import { REPORTING_QUERY_LIMIT } from "@/lib/rate-limit";
import { getReportingAccessCapabilities } from "@/modules/reporting/application/reporting-authorization";
import { requireReportingApiV2User } from "@/modules/shared/api-v2-authorization";
import { apiV2Error, apiV2Success, handleApiV2Error } from "@/modules/shared/api-v2-response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requireReportingApiV2User(request, {
      rateLimit: REPORTING_QUERY_LIMIT,
    });
    if (!auth.authorized) return auth.response;
    const capabilities = await getReportingAccessCapabilities(auth.user.id);
    if (!capabilities) {
      return apiV2Error(
        request,
        "دسترسی به گزارش‌های مدیریتی مجاز نیست",
        403,
        "FORBIDDEN"
      );
    }
    return apiV2Success(request, capabilities);
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت سطح دسترسی گزارش‌ها",
      "GET /api/v2/reporting/access"
    );
  }
}
