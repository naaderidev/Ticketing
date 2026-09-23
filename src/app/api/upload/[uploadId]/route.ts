import { apiJsonResponse } from "@/lib/api-date-contract";
import { removePendingUpload } from "@/lib/attachment-service";
import { requireAuthenticatedUser } from "@/lib/api-authorization";
import { apiError, handleApiError } from "@/lib/api-validation";
import { errors } from "@/lib/strings";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { recordAuditEvent } from "@/lib/audit-log";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  try {
    const auth = await requireAuthenticatedUser({
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;

    const { uploadId } = await params;
    if (!UUID_PATTERN.test(uploadId)) {
      return apiError("شناسه فایل معتبر نیست", 400, "INVALID_PATH_PARAMETER");
    }

    await removePendingUpload(uploadId, auth.value.id);
    await recordAuditEvent({
      request,
      action: "PENDING_UPLOAD_DELETE",
      outcome: "SUCCESS",
      actorUserId: auth.value.id,
      sessionId: auth.value.sessionId,
      targetType: "PENDING_UPLOAD",
      targetId: uploadId,
    });
    return apiJsonResponse({ message: "فایل حذف شد" });
  } catch (error) {
    return handleApiError(error, errors.DELETE_FILE, "Error deleting pending upload");
  }
}
