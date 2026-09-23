import { apiJsonResponse } from "@/lib/api-date-contract";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  apiError,
  handleApiError,
  parseJsonBody,
  rateLimitError,
} from "@/lib/api-validation";
import { isTransactionVolumeIngestionEnabled } from "@/lib/feature-flags";
import { consumeRateLimit } from "@/lib/rate-limit";
import { hasValidReportingMaintenanceToken } from "@/lib/reporting-maintenance-auth";
import { getRequestSourceHash } from "@/lib/request-security";
import { ingestTransactionVolumes } from "@/modules/reporting/application/transaction-volume-ingestion-service";
import { transactionVolumeBatchSchema } from "@/modules/reporting/contracts/reporting-kpi-schemas";

const SOURCE_LIMIT = {
  scope: "transaction-volume-ingestion-source",
  limit: 30,
  windowSeconds: 15 * 60,
};
const OPERATION_LIMIT = {
  scope: "transaction-volume-ingestion-operation",
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
        action: "TRANSACTION_VOLUME_INGEST",
        outcome: "DENIED",
      });
      return apiError("دسترسی غیرمجاز", 401, "UNAUTHORIZED");
    }
    if (!isTransactionVolumeIngestionEnabled()) {
      return apiError(
        "ورودی حجم تراکنش در این محیط فعال نیست",
        503,
        "INTERNAL_ERROR"
      );
    }
    const operationLimit = await consumeRateLimit(
      OPERATION_LIMIT,
      "authorized-transaction-volume-ingestion"
    );
    if (!operationLimit.allowed) {
      return rateLimitError(operationLimit.retryAfterSeconds);
    }
    const body = await parseJsonBody(request, transactionVolumeBatchSchema);
    if (!body.success) return body.response;
    const result = await ingestTransactionVolumes(body.data);
    await recordAuditEvent({
      request,
      action: "TRANSACTION_VOLUME_INGEST",
      outcome: "SUCCESS",
      targetType: "TRANSACTION_VOLUME_BATCH",
      targetId: `${result.providerCode}:${result.sourceVersion}`,
      metadata: {
        received: result.received,
        inserted: result.inserted,
        replayed: result.replayed,
        statusUpdated: result.statusUpdated,
      },
    });
    return apiJsonResponse(result, { status: result.inserted > 0 ? 201 : 200 });
  } catch (error) {
    await recordAuditEvent({
      request,
      action: "TRANSACTION_VOLUME_INGEST",
      outcome: "FAILURE",
    });
    return handleApiError(
      error,
      "خطا در ثبت حجم تراکنش",
      "Error ingesting transaction volumes"
    );
  }
}
