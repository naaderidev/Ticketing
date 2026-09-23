import { apiJsonResponse } from "@/lib/api-date-contract";
import {
  cleanupExpiredPendingUploads,
  processAttachmentDeletionJobs,
} from "@/lib/attachment-service";
import { hasValidAttachmentMaintenanceToken } from "@/lib/attachment-maintenance-auth";
import { apiError, handleApiError } from "@/lib/api-validation";
import { consumeRateLimit, deleteExpiredRateLimitBuckets } from "@/lib/rate-limit";
import { getRequestSourceHash } from "@/lib/request-security";
import { rateLimitError } from "@/lib/api-validation";
import { recordAuditEvent } from "@/lib/audit-log";
import { deleteExpiredSessions } from "@/lib/auth";
import {
  deleteExpiredTicketCommandReceipts,
  reconcileMappedLegacyTickets,
} from "@/modules/tickets/application/ticket-service";

const MAINTENANCE_SOURCE_LIMIT = {
  scope: "maintenance-source",
  limit: 30,
  windowSeconds: 15 * 60,
};
const MAINTENANCE_OPERATION_LIMIT = {
  scope: "maintenance-operation",
  limit: 10,
  windowSeconds: 60,
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const sourceLimit = await consumeRateLimit(
      MAINTENANCE_SOURCE_LIMIT,
      `source:${getRequestSourceHash(request)}`
    );
    if (!sourceLimit.allowed) return rateLimitError(sourceLimit.retryAfterSeconds);

    if (!hasValidAttachmentMaintenanceToken(request)) {
      await recordAuditEvent({
        request,
        action: "ATTACHMENT_MAINTENANCE_CLEANUP",
        outcome: "DENIED",
      });
      return apiError("دسترسی غیرمجاز", 401, "UNAUTHORIZED");
    }

    const operationLimit = await consumeRateLimit(
      MAINTENANCE_OPERATION_LIMIT,
      "authorized-maintenance"
    );
    if (!operationLimit.allowed) {
      return rateLimitError(operationLimit.retryAfterSeconds);
    }

    const [
      pendingUploads,
      deletedAttachments,
      rateLimitBuckets,
      sessions,
      ticketCommandReceipts,
      legacyTicketReconciliation,
    ] = await Promise.all([
      cleanupExpiredPendingUploads(100),
      processAttachmentDeletionJobs(100),
      deleteExpiredRateLimitBuckets(),
      deleteExpiredSessions(),
      deleteExpiredTicketCommandReceipts(),
      reconcileMappedLegacyTickets(100),
    ]);

    await recordAuditEvent({
      request,
      action: "ATTACHMENT_MAINTENANCE_CLEANUP",
      outcome: "SUCCESS",
      targetType: "MAINTENANCE_JOB",
      metadata: {
        pendingDeleted: pendingUploads.deleted,
        pendingFailed: pendingUploads.failed,
        attachmentDeleted: deletedAttachments.deleted,
        attachmentFailed: deletedAttachments.failed,
        rateLimitBucketsDeleted: rateLimitBuckets.count,
        sessionsDeleted: sessions.count,
        ticketCommandReceiptsDeleted: ticketCommandReceipts.count,
        legacyTicketsReconciled: legacyTicketReconciliation.reconciled,
        legacyTicketsSkipped: legacyTicketReconciliation.skipped,
      },
    });

    return apiJsonResponse({
      pendingUploads,
      deletedAttachments,
      rateLimitBuckets: rateLimitBuckets.count,
      sessions: sessions.count,
      ticketCommandReceipts: ticketCommandReceipts.count,
      legacyTicketReconciliation,
    });
  } catch (error) {
    await recordAuditEvent({
      request,
      action: "ATTACHMENT_MAINTENANCE_CLEANUP",
      outcome: "FAILURE",
    });
    return handleApiError(
      error,
      "خطا در پاک‌سازی فایل‌ها",
      "Error running attachment cleanup"
    );
  }
}
