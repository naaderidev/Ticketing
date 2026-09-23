import { apiJsonResponse } from "@/lib/api-date-contract";
import { getFaqById, updateFaq, deleteFaq } from "@/lib/faq-service";
import { errors } from "@/lib/strings";
import { requireAuthenticatedUser, requireGlobalPermission } from "@/lib/api-authorization";
import { updateFaqSchema } from "@/lib/validations";
import { apiError, handleApiError, parseJsonBody, parsePositiveInteger } from "@/lib/api-validation";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuthenticatedUser();
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const parsedId = parsePositiveInteger(id, "شناسه پرسش");
    if (!parsedId.success) return parsedId.response;
    const faq = await getFaqById(parsedId.data);

    if (!faq) {
      return apiError(errors.FAQ_NOT_FOUND, 404, "NOT_FOUND");
    }

    return apiJsonResponse(faq);
  } catch (error) {
    return handleApiError(error, errors.FETCH_FAQ, "Error fetching FAQ");
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
    const parsedId = parsePositiveInteger(id, "شناسه پرسش");
    if (!parsedId.success) return parsedId.response;
    const body = await parseJsonBody(request, updateFaqSchema);
    if (!body.success) return body.response;
    const updated = await updateFaq(parsedId.data, body.data);
    return apiJsonResponse(updated);
  } catch (error) {
    return handleApiError(error, errors.UPDATE_FAQ, "Error updating FAQ");
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
    const parsedId = parsePositiveInteger(id, "شناسه پرسش");
    if (!parsedId.success) return parsedId.response;
    await deleteFaq(parsedId.data);
    return apiJsonResponse({ message: "پرسش و پاسخ با موفقیت حذف شد" });
  } catch (error) {
    return handleApiError(error, errors.DELETE_FAQ, "Error deleting FAQ");
  }
}
