import { apiJsonResponse } from "@/lib/api-date-contract";
import { createPendingUpload } from "@/lib/attachment-service";
import { MAX_ATTACHMENT_SIZE } from "@/lib/attachment-inspection";
import { requireAuthenticatedUser } from "@/lib/api-authorization";
import { apiError, handleApiError } from "@/lib/api-validation";
import { errors } from "@/lib/strings";
import { UPLOAD_LIMIT } from "@/lib/rate-limit";
import { recordAuditEvent } from "@/lib/audit-log";

const MAX_MULTIPART_REQUEST_SIZE = MAX_ATTACHMENT_SIZE + 1024 * 1024;

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser({ rateLimit: UPLOAD_LIMIT });
    if (!auth.authorized) return auth.response;

    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_MULTIPART_REQUEST_SIZE) {
      return apiError(errors.FILE_TOO_LARGE, 400, "INVALID_REQUEST");
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return apiError("فرم ارسالی معتبر نیست", 400, "INVALID_REQUEST");
    }
    if (
      [...formData.keys()].some((key) => key !== "file") ||
      formData.getAll("file").length !== 1
    ) {
      return apiError("ساختار فرم ارسالی معتبر نیست", 400, "INVALID_REQUEST");
    }
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return apiError(errors.FILE_NOT_SENT, 400, "INVALID_REQUEST");
    }

    if (file.size === 0) {
      return apiError(errors.FILE_EMPTY, 400, "INVALID_REQUEST");
    }

    if (file.size > MAX_ATTACHMENT_SIZE) {
      return apiError(errors.FILE_TOO_LARGE, 400, "INVALID_REQUEST");
    }

    const upload = await createPendingUpload({
      uploaderId: auth.value.id,
      originalName: file.name,
      declaredMediaType: file.type,
      content: Buffer.from(await file.arrayBuffer()),
    });

    await recordAuditEvent({
      request,
      action: "ATTACHMENT_UPLOAD",
      outcome: "SUCCESS",
      actorUserId: auth.value.id,
      sessionId: auth.value.sessionId,
      targetType: "PENDING_UPLOAD",
      targetId: upload.uploadId,
      metadata: { fileSize: file.size, fileType: file.type },
    });

    return apiJsonResponse(upload, { status: 201 });
  } catch (error) {
    return handleApiError(error, errors.UPLOAD_FILE, "Error uploading file");
  }
}
