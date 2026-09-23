import { apiJsonResponse } from "@/lib/api-date-contract";
import { recordAuditEvent } from "@/lib/audit-log";
import { apiError, handleApiError, rateLimitError } from "@/lib/api-validation";
import { isAutomatedResolutionEnabled } from "@/lib/feature-flags";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getReportingConfig } from "@/lib/reporting-config";
import { hasValidReportingMaintenanceToken } from "@/lib/reporting-maintenance-auth";
import { getRequestSourceHash } from "@/lib/request-security";
import { finalizeMaturedSupportJourneys } from "@/modules/knowledge/application/support-journey-service";

const SOURCE_LIMIT = {
  scope: "support-journey-finalizer-source",
  limit: 30,
  windowSeconds: 15 * 60,
};
const OPERATION_LIMIT = {
  scope: "support-journey-finalizer-operation",
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
        action: "SUPPORT_JOURNEY_FINALIZE",
        outcome: "DENIED",
      });
      return apiError("دسترسی غیرمجاز", 401, "UNAUTHORIZED");
    }
    if (!isAutomatedResolutionEnabled()) {
      return apiError("زیرساخت حل خودکار فعال نیست", 503, "INTERNAL_ERROR");
    }
    const operationLimit = await consumeRateLimit(
      OPERATION_LIMIT,
      "authorized-support-journey-finalizer"
    );
    if (!operationLimit.allowed) {
      return rateLimitError(operationLimit.retryAfterSeconds);
    }
    const result = await finalizeMaturedSupportJourneys({
      limit: getReportingConfig().batchSize,
    });
    await recordAuditEvent({
      request,
      action: "SUPPORT_JOURNEY_FINALIZE",
      outcome: "SUCCESS",
      targetType: "MAINTENANCE_JOB",
      metadata: result,
    });
    return apiJsonResponse(result);
  } catch (error) {
    await recordAuditEvent({
      request,
      action: "SUPPORT_JOURNEY_FINALIZE",
      outcome: "FAILURE",
    });
    return handleApiError(
      error,
      "خطا در نهایی‌سازی Journeyهای حل خودکار",
      "Error finalizing support journeys"
    );
  }
}
