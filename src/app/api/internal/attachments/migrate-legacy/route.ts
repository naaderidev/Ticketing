import { apiJsonResponse } from "@/lib/api-date-contract";
import { migrateLegacyAttachments } from "@/lib/attachment-service";
import { hasValidAttachmentMaintenanceToken } from "@/lib/attachment-maintenance-auth";
import { apiError, handleApiError, rateLimitError } from "@/lib/api-validation";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestSourceHash } from "@/lib/request-security";
import { recordAuditEvent } from "@/lib/audit-log";

const MIGRATION_SOURCE_LIMIT = {
  scope: "migration-source",
  limit: 30,
  windowSeconds: 15 * 60,
};
const MIGRATION_OPERATION_LIMIT = {
  scope: "migration-operation",
  limit: 5,
  windowSeconds: 60,
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const sourceLimit = await consumeRateLimit(
      MIGRATION_SOURCE_LIMIT,
      `source:${getRequestSourceHash(request)}`
    );
    if (!sourceLimit.allowed) return rateLimitError(sourceLimit.retryAfterSeconds);

    if (!hasValidAttachmentMaintenanceToken(request)) {
      await recordAuditEvent({
        request,
        action: "ATTACHMENT_LEGACY_MIGRATION",
        outcome: "DENIED",
      });
      return apiError("دسترسی غیرمجاز", 401, "UNAUTHORIZED");
    }

    const operationLimit = await consumeRateLimit(
      MIGRATION_OPERATION_LIMIT,
      "authorized-maintenance"
    );
    if (!operationLimit.allowed) {
      return rateLimitError(operationLimit.retryAfterSeconds);
    }

    const result = await migrateLegacyAttachments(25);
    await recordAuditEvent({
      request,
      action: "ATTACHMENT_LEGACY_MIGRATION",
      outcome: "SUCCESS",
      targetType: "MAINTENANCE_JOB",
      metadata: result,
    });
    return apiJsonResponse(result);
  } catch (error) {
    await recordAuditEvent({
      request,
      action: "ATTACHMENT_LEGACY_MIGRATION",
      outcome: "FAILURE",
    });
    return handleApiError(
      error,
      "خطا در انتقال فایل‌های قدیمی",
      "Error migrating legacy attachments"
    );
  }
}
