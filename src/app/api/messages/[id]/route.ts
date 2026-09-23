import { apiJsonResponse } from "@/lib/api-date-contract";
import {
  getMessageById,
  updateMessage,
  deleteMessage,
} from "@/lib/message-service";
import { errors } from "@/lib/strings";
import { requireGlobalPermission } from "@/lib/api-authorization";
import { updatePredefinedMessageSchema } from "@/lib/validations";
import { apiError, handleApiError, parseJsonBody, parsePositiveInteger } from "@/lib/api-validation";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireGlobalPermission("knowledge.article.manage");
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const parsedId = parsePositiveInteger(id, "شناسه پیام");
    if (!parsedId.success) return parsedId.response;
    const message = await getMessageById(parsedId.data);

    if (!message) {
      return apiError(errors.MESSAGE_NOT_FOUND, 404, "NOT_FOUND");
    }

    return apiJsonResponse(message);
  } catch (error) {
    return handleApiError(error, errors.FETCH_MESSAGE, "Error fetching message");
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireGlobalPermission("knowledge.article.manage", { rateLimit: AUTHENTICATED_MUTATION_LIMIT });
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const parsedId = parsePositiveInteger(id, "شناسه پیام");
    if (!parsedId.success) return parsedId.response;
    const body = await parseJsonBody(request, updatePredefinedMessageSchema);
    if (!body.success) return body.response;
    const updated = await updateMessage(parsedId.data, body.data);
    return apiJsonResponse(updated);
  } catch (error) {
    return handleApiError(error, errors.UPDATE_MESSAGE, "Error updating message");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireGlobalPermission("knowledge.article.manage", { rateLimit: AUTHENTICATED_MUTATION_LIMIT });
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const parsedId = parsePositiveInteger(id, "شناسه پیام");
    if (!parsedId.success) return parsedId.response;
    await deleteMessage(parsedId.data);
    return apiJsonResponse({ message: "پیام با موفقیت حذف شد" });
  } catch (error) {
    return handleApiError(error, errors.DELETE_MESSAGE, "Error deleting message");
  }
}
