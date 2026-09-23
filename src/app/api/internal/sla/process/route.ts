import { apiJsonResponse } from "@/lib/api-date-contract";
import { recordAuditEvent } from "@/lib/audit-log";
import { apiError, handleApiError, rateLimitError } from "@/lib/api-validation";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestSourceHash } from "@/lib/request-security";
import { hasValidSlaMaintenanceToken } from "@/lib/sla-maintenance-auth";
import { runSlaMaintenance } from "@/modules/sla-routing/application/sla-worker";

const SOURCE_LIMIT = {
  scope: "sla-maintenance-source",
  limit: 30,
  windowSeconds: 15 * 60,
};
const OPERATION_LIMIT = {
  scope: "sla-maintenance-operation",
  limit: 12,
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

    if (!hasValidSlaMaintenanceToken(request)) {
      await recordAuditEvent({
        request,
        action: "SLA_MAINTENANCE_PROCESS",
        outcome: "DENIED",
      });
      return apiError("دسترسی غیرمجاز", 401, "UNAUTHORIZED");
    }

    const operationLimit = await consumeRateLimit(
      OPERATION_LIMIT,
      "authorized-sla-maintenance"
    );
    if (!operationLimit.allowed) {
      return rateLimitError(operationLimit.retryAfterSeconds);
    }

    const result = await runSlaMaintenance();
    await recordAuditEvent({
      request,
      action: "SLA_MAINTENANCE_PROCESS",
      outcome: "SUCCESS",
      targetType: "MAINTENANCE_JOB",
      metadata: result,
    });
    return apiJsonResponse(result);
  } catch (error) {
    await recordAuditEvent({
      request,
      action: "SLA_MAINTENANCE_PROCESS",
      outcome: "FAILURE",
    });
    return handleApiError(
      error,
      "خطا در پردازش SLA",
      "Error processing SLA maintenance"
    );
  }
}
