import { REPORTING_QUERY_LIMIT } from "@/lib/rate-limit";
import { getRecurringProblemDrillDown } from "@/modules/reporting/application/recurring-problem-service";
import { recurringProblemDrillDownQuerySchema } from "@/modules/reporting/contracts/reporting-kpi-schemas";
import { isReportingKpiError } from "@/modules/reporting/domain/reporting-kpi-error";
import { requireReportingApiV2User } from "@/modules/shared/api-v2-authorization";
import { apiV2Error, apiV2Success, handleApiV2Error } from "@/modules/shared/api-v2-response";
import { parseApiV2Query } from "@/modules/shared/api-v2-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ signalKey: string }> }
) {
  try {
    const auth = await requireReportingApiV2User(request, {
      rateLimit: REPORTING_QUERY_LIMIT,
    });
    if (!auth.authorized) return auth.response;

    const { signalKey } = await params;
    if (!/^[a-f0-9]{64}$/.test(signalKey)) {
      return apiV2Error(request, "شناسه سیگنال معتبر نیست", 400, "INVALID_PATH_PARAMETER");
    }
    const query = parseApiV2Query(
      request,
      new URL(request.url).searchParams,
      recurringProblemDrillDownQuerySchema
    );
    if (!query.success) return query.response;

    const result = await getRecurringProblemDrillDown({
      actorUserId: auth.user.id,
      signalKey,
      limit: query.data.limit,
      range: query.data.from && query.data.to
        ? { from: query.data.from, to: query.data.to }
        : undefined,
    });
    return apiV2Success(request, result);
  } catch (error) {
    if (isReportingKpiError(error)) {
      return apiV2Error(request, error.message, error.status, error.code);
    }
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت جزئیات مشکل پرتکرار",
      "GET /api/v2/reporting/kpis/recurring-problems/:signalKey/tickets"
    );
  }
}
