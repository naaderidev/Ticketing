import { recordAuditEvent, recordRequiredAuditEvent } from "@/lib/audit-log";
import { getRequestId } from "@/lib/request-security";
import { REPORTING_EXPORT_LIMIT } from "@/lib/rate-limit";
import { getAutomatedResolutionReport } from "@/modules/reporting/application/automated-resolution-report-service";
import {
  hasReportingExportPermissionForScope,
  resolveReportingAccessScope,
} from "@/modules/reporting/application/reporting-authorization";
import {
  isReportingExportType,
  serializeAggregateReportCsv,
  type ReportingExportType,
} from "@/modules/reporting/application/reporting-csv-export";
import { getQualityReport } from "@/modules/reporting/application/quality-report-service";
import { getRecurringProblemsReport } from "@/modules/reporting/application/recurring-problem-service";
import { getTicketPerTransactionReport } from "@/modules/reporting/application/ticket-per-transaction-report-service";
import { getTimeSlaReport } from "@/modules/reporting/application/time-sla-report-service";
import {
  recurringProblemsReportQuerySchema,
  reportingRangeQuerySchema,
  ticketPerTransactionReportQuerySchema,
} from "@/modules/reporting/contracts/reporting-kpi-schemas";
import { isReportingKpiError } from "@/modules/reporting/domain/reporting-kpi-error";
import { requireReportingApiV2User } from "@/modules/shared/api-v2-authorization";
import { apiV2Error, handleApiV2Error } from "@/modules/shared/api-v2-response";
import { parseApiV2Query } from "@/modules/shared/api-v2-validation";
import { toJalaliApiPayload } from "@/lib/jalali-date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readExportReport(input: {
  request: Request;
  reportType: ReportingExportType;
  actorUserId: number;
  asOf: Date;
}) {
  const searchParams = new URL(input.request.url).searchParams;
  if (input.reportType === "ticket-per-transaction") {
    const query = parseApiV2Query(
      input.request,
      searchParams,
      ticketPerTransactionReportQuerySchema
    );
    if (!query.success) return query;
    return {
      success: true as const,
      data: await getTicketPerTransactionReport({
        actorUserId: input.actorUserId,
        query: query.data,
        now: input.asOf,
      }),
    };
  }
  if (input.reportType === "recurring-problems") {
    const query = parseApiV2Query(
      input.request,
      searchParams,
      recurringProblemsReportQuerySchema
    );
    if (!query.success) return query;
    return {
      success: true as const,
      data: await getRecurringProblemsReport({
        actorUserId: input.actorUserId,
        query: query.data,
        now: input.asOf,
      }),
    };
  }
  const query = parseApiV2Query(
    input.request,
    searchParams,
    reportingRangeQuerySchema
  );
  if (!query.success) return query;
  const common = {
    actorUserId: input.actorUserId,
    range: query.data,
    now: input.asOf,
  };
  const data = input.reportType === "time-sla"
    ? await getTimeSlaReport(common)
    : input.reportType === "quality"
      ? await getQualityReport(common)
      : await getAutomatedResolutionReport(common);
  return { success: true as const, data };
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/v2/reporting/exports/[reportType]">
) {
  const requestId = getRequestId(request);
  try {
    const auth = await requireReportingApiV2User(request, {
      rateLimit: REPORTING_EXPORT_LIMIT,
    });
    if (!auth.authorized) return auth.response;
    const { reportType } = await params;
    if (!isReportingExportType(reportType)) {
      return apiV2Error(
        request,
        "نوع گزارش برای خروجی معتبر نیست",
        400,
        "INVALID_PATH_PARAMETER"
      );
    }

    const asOf = new Date();
    const scope = await resolveReportingAccessScope(auth.user.id, asOf);
    if (!scope) {
      return apiV2Error(request, "دسترسی گزارش مجاز نیست", 403, "FORBIDDEN");
    }
    const canExport = await hasReportingExportPermissionForScope(
      auth.user.id,
      scope,
      asOf
    );
    if (!canExport) {
      await recordAuditEvent({
        request,
        requestId,
        action: "REPORTING_EXPORT",
        outcome: "DENIED",
        actorUserId: auth.user.id,
        sessionId: auth.user.sessionId,
        targetType: "REPORT",
        targetId: reportType,
      });
      return apiV2Error(
        request,
        "مجوز صریح خروجی گزارش وجود ندارد",
        403,
        "FORBIDDEN"
      );
    }

    const result = await readExportReport({
      request,
      reportType,
      actorUserId: auth.user.id,
      asOf,
    });
    if (!result.success) return result.response;
    await recordRequiredAuditEvent({
      request,
      requestId,
      action: "REPORTING_EXPORT",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      targetType: "REPORT",
      targetId: reportType,
      metadata: {
        reportType,
        definitionVersion: result.data.definitionVersion,
        scopeType: scope.type,
        accessMode: scope.accessMode,
        teamIds: scope.teamIds ?? [],
      },
    });

    return new Response(
      serializeAggregateReportCsv(toJalaliApiPayload(result.data)),
      {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="kpi-${reportType}.csv"`,
        "Cache-Control": "private, no-store",
        "x-request-id": requestId,
        },
      }
    );
  } catch (error) {
    if (isReportingKpiError(error)) {
      return apiV2Error(request, error.message, error.status, error.code);
    }
    return handleApiV2Error(
      request,
      error,
      "خطا در ایجاد خروجی گزارش",
      "GET /api/v2/reporting/exports/:reportType"
    );
  }
}
