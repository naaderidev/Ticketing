import { apiJsonResponse } from "@/lib/api-date-contract";
import { recordAuditEvent } from "@/lib/audit-log";
import { apiError, handleApiError, rateLimitError } from "@/lib/api-validation";
import { isRecurringProblemDetectionEnabled } from "@/lib/feature-flags";
import { consumeRateLimit } from "@/lib/rate-limit";
import { hasValidReportingMaintenanceToken } from "@/lib/reporting-maintenance-auth";
import { getRequestSourceHash } from "@/lib/request-security";
import { generateRecurringProblemSignals } from "@/modules/reporting/application/recurring-problem-service";

const SOURCE_LIMIT = {
  scope: "recurring-problem-source",
  limit: 30,
  windowSeconds: 15 * 60,
};
const OPERATION_LIMIT = {
  scope: "recurring-problem-operation",
  limit: 4,
  windowSeconds: 60 * 60,
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
        action: "RECURRING_PROBLEM_GENERATE",
        outcome: "DENIED",
      });
      return apiError("دسترسی غیرمجاز", 401, "UNAUTHORIZED");
    }
    if (!isRecurringProblemDetectionEnabled()) {
      return apiError(
        "موتور تشخیص مشکلات پرتکرار فعال نیست",
        503,
        "INTERNAL_ERROR"
      );
    }

    const operationLimit = await consumeRateLimit(
      OPERATION_LIMIT,
      "authorized-recurring-problem-generator"
    );
    if (!operationLimit.allowed) return rateLimitError(operationLimit.retryAfterSeconds);

    const result = await generateRecurringProblemSignals();
    await recordAuditEvent({
      request,
      action: "RECURRING_PROBLEM_GENERATE",
      outcome: "SUCCESS",
      targetType: "MAINTENANCE_JOB",
      metadata: result,
    });
    return apiJsonResponse(result);
  } catch (error) {
    await recordAuditEvent({
      request,
      action: "RECURRING_PROBLEM_GENERATE",
      outcome: "FAILURE",
    });
    return handleApiError(
      error,
      "خطا در تولید سیگنال مشکلات پرتکرار",
      "Error generating recurring problem signals"
    );
  }
}
