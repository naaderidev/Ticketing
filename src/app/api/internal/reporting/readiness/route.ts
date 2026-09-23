import { apiJsonResponse } from "@/lib/api-date-contract";
import { recordAuditEvent } from "@/lib/audit-log";
import { apiError, handleApiError, rateLimitError } from "@/lib/api-validation";
import { consumeRateLimit } from "@/lib/rate-limit";
import { hasValidReportingMaintenanceToken } from "@/lib/reporting-maintenance-auth";
import { getReportingRolloutConfig } from "@/lib/reporting-rollout-config";
import { getRequestSourceHash } from "@/lib/request-security";
import { reconcileReportingProjection } from "@/modules/reporting/application/reporting-reconciliation-service";

const SOURCE_LIMIT = {
  scope: "reporting-readiness-source",
  limit: 30,
  windowSeconds: 15 * 60,
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreJson(body: unknown, status = 200): Response {
  return apiJsonResponse(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const sourceLimit = await consumeRateLimit(
      SOURCE_LIMIT,
      `source:${getRequestSourceHash(request)}`
    );
    if (!sourceLimit.allowed) return rateLimitError(sourceLimit.retryAfterSeconds);

    if (!hasValidReportingMaintenanceToken(request)) {
      await recordAuditEvent({
        request,
        action: "REPORTING_RELEASE_READINESS",
        outcome: "DENIED",
      });
      return apiError("دسترسی غیرمجاز", 401, "UNAUTHORIZED");
    }

    const [reconciliation, rollout] = await Promise.all([
      reconcileReportingProjection(),
      Promise.resolve(getReportingRolloutConfig()),
    ]);
    const rolloutSummary = {
      stage: rollout.stage,
      projectionEnabled: rollout.projectionEnabled,
      apiEnabled: rollout.apiEnabled,
      canaryActorCount: rollout.canaryUserIds.size,
    };
    await recordAuditEvent({
      request,
      action: "REPORTING_RELEASE_READINESS",
      outcome: reconciliation.ready ? "SUCCESS" : "FAILURE",
      targetType: "REPORTING_ROLLOUT",
      metadata: {
        stage: rollout.stage,
        ready: reconciliation.ready,
        blockerCount: reconciliation.blockers.length,
        warningCount: reconciliation.warnings.length,
      },
    });
    return noStoreJson({ rollout: rolloutSummary, reconciliation });
  } catch (error) {
    await recordAuditEvent({
      request,
      action: "REPORTING_RELEASE_READINESS",
      outcome: "FAILURE",
    });
    return handleApiError(
      error,
      "خطا در بررسی آمادگی انتشار گزارش‌ها",
      "Error reading Reporting release readiness"
    );
  }
}
