import { REPORTING_QUERY_LIMIT } from "@/lib/rate-limit";
import { getRecurringProblemsReport } from "@/modules/reporting/application/recurring-problem-service";
import { recurringProblemsReportQuerySchema } from "@/modules/reporting/contracts/reporting-kpi-schemas";
import { isReportingKpiError } from "@/modules/reporting/domain/reporting-kpi-error";
import { requireReportingApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Error,
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import { parseApiV2Query } from "@/modules/shared/api-v2-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireReportingApiV2User(request, {
      rateLimit: REPORTING_QUERY_LIMIT,
    });
    if (!auth.authorized) return auth.response;

    const query = parseApiV2Query(
      request,
      new URL(request.url).searchParams,
      recurringProblemsReportQuerySchema
    );
    if (!query.success) return query.response;

    const report = await getRecurringProblemsReport({
      actorUserId: auth.user.id,
      query: query.data,
    });
    return apiV2Success(request, report);
  } catch (error) {
    if (isReportingKpiError(error)) {
      return apiV2Error(request, error.message, error.status, error.code);
    }
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت گزارش مشکلات پرتکرار",
      "GET /api/v2/reporting/kpis/recurring-problems"
    );
  }
}
