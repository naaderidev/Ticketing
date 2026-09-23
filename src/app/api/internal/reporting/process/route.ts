import { apiJsonResponse } from "@/lib/api-date-contract";
import { recordAuditEvent } from "@/lib/audit-log";
import { apiError, handleApiError, rateLimitError } from "@/lib/api-validation";
import { isReportingProjectionEnabled } from "@/lib/feature-flags";
import { consumeRateLimit } from "@/lib/rate-limit";
import { hasValidReportingMaintenanceToken } from "@/lib/reporting-maintenance-auth";
import { getRequestSourceHash } from "@/lib/request-security";
import { processReportingProjection } from "@/modules/reporting/application/reporting-projection-service";

const SOURCE_LIMIT = {
  scope: "reporting-projection-source",
  limit: 30,
  windowSeconds: 15 * 60,
};
const OPERATION_LIMIT = {
  scope: "reporting-projection-operation",
  limit: 30,
  windowSeconds: 60,
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const sourceLimit = await consumeRateLimit(
      SOURCE_LIMIT,
      `source:${getRequestSourceHash(request)}`
    );
    if (!sourceLimit.allowed) return rateLimitError(sourceLimit.retryAfterSeconds);

    if (!hasValidReportingMaintenanceToken(request)) {
      await recordAuditEvent({
        request,
        action: "REPORTING_PROJECTION_PROCESS",
        outcome: "DENIED",
      });
      return apiError("دسترسی غیرمجاز", 401, "UNAUTHORIZED");
    }
    if (!isReportingProjectionEnabled()) {
      return apiError(
        "موتور گزارش‌گیری در این محیط فعال نیست",
        503,
        "INTERNAL_ERROR"
      );
    }

    const operationLimit = await consumeRateLimit(
      OPERATION_LIMIT,
      "authorized-reporting-projection"
    );
    if (!operationLimit.allowed) {
      return rateLimitError(operationLimit.retryAfterSeconds);
    }

    const result = await processReportingProjection();
    await recordAuditEvent({
      request,
      action: "REPORTING_PROJECTION_PROCESS",
      outcome: result.acquired ? "SUCCESS" : "DENIED",
      targetType: "MAINTENANCE_JOB",
      metadata: result,
    });
    return apiJsonResponse(result, { status: result.acquired ? 200 : 409 });
  } catch (error) {
    await recordAuditEvent({
      request,
      action: "REPORTING_PROJECTION_PROCESS",
      outcome: "FAILURE",
    });
    return handleApiError(
      error,
      "خطا در پردازش گزارش‌ها",
      "Error processing reporting projection"
    );
  }
}
