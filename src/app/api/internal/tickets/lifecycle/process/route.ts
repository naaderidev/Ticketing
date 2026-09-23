import { apiJsonResponse } from "@/lib/api-date-contract";
import { recordAuditEvent } from "@/lib/audit-log";
import { apiError, handleApiError, rateLimitError } from "@/lib/api-validation";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestSourceHash } from "@/lib/request-security";
import { hasValidSlaMaintenanceToken } from "@/lib/sla-maintenance-auth";
import { getSlaRoutingConfig } from "@/lib/sla-routing-config";
import { runTicketLifecycleMaintenance } from "@/modules/tickets/application/ticket-lifecycle-service";

const SOURCE_LIMIT = { scope: "ticket-lifecycle-source", limit: 30, windowSeconds: 15 * 60 };
const OPERATION_LIMIT = { scope: "ticket-lifecycle-operation", limit: 12, windowSeconds: 60 };
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const sourceLimit = await consumeRateLimit(SOURCE_LIMIT, `source:${getRequestSourceHash(request)}`);
    if (!sourceLimit.allowed) return rateLimitError(sourceLimit.retryAfterSeconds);
    if (!hasValidSlaMaintenanceToken(request)) {
      await recordAuditEvent({ request, action: "TICKET_LIFECYCLE_PROCESS", outcome: "DENIED" });
      return apiError("دسترسی غیرمجاز", 401, "UNAUTHORIZED");
    }
    const operationLimit = await consumeRateLimit(OPERATION_LIMIT, "authorized-ticket-lifecycle");
    if (!operationLimit.allowed) return rateLimitError(operationLimit.retryAfterSeconds);
    const result = await runTicketLifecycleMaintenance(getSlaRoutingConfig().batchSize);
    await recordAuditEvent({ request, action: "TICKET_LIFECYCLE_PROCESS", outcome: "SUCCESS", targetType: "MAINTENANCE_JOB", metadata: result });
    return apiJsonResponse(result);
  } catch (error) {
    await recordAuditEvent({ request, action: "TICKET_LIFECYCLE_PROCESS", outcome: "FAILURE" });
    return handleApiError(error, "خطا در پردازش چرخه عمر تیکت", "Error processing ticket lifecycle maintenance");
  }
}
