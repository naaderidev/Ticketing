import { hasTicketPermission } from "@/lib/authorization-policy";
import {
  getAttachmentForDownload,
  readAttachmentContent,
} from "@/lib/attachment-service";
import { requireAuthenticatedUser } from "@/lib/api-authorization";
import {
  apiError,
  handleApiError,
  parsePositiveInteger,
} from "@/lib/api-validation";
import { errors } from "@/lib/strings";

export const runtime = "nodejs";

function contentDisposition(fileName: string): string {
  const asciiName = fileName
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  return `attachment; filename="${asciiName || "attachment"}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  try {
    const auth = await requireAuthenticatedUser();
    if (!auth.authorized) return auth.response;

    const { attachmentId } = await params;
    const parsedId = parsePositiveInteger(attachmentId, "شناسه فایل معتبر نیست");
    if (!parsedId.success) return parsedId.response;

    const attachment = await getAttachmentForDownload(parsedId.data);
    const ticket = attachment?.ticket ?? attachment?.reply?.ticket;
    if (
      !attachment ||
      !ticket ||
      !hasTicketPermission(auth.value, ticket, "read")
    ) {
      return apiError(errors.FILE_NOT_FOUND, 404, "NOT_FOUND");
    }

    const content = await readAttachmentContent(attachment);
    const responseBody = new Uint8Array(content.byteLength);
    responseBody.set(content);
    return new Response(responseBody.buffer, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": contentDisposition(attachment.fileName),
        "Content-Length": String(content.byteLength),
        "Content-Security-Policy": "sandbox",
        "Content-Type": attachment.fileType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error, errors.DOWNLOAD_FILE, "Error downloading attachment");
  }
}
