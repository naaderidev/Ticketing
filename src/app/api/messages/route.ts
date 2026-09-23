import { apiJsonResponse } from "@/lib/api-date-contract";
import { getMessages, createMessage } from "@/lib/message-service";
import { errors } from "@/lib/strings";
import { predefinedMessageSchema } from "@/lib/validations";
import { requireGlobalPermission } from "@/lib/api-authorization";
import { handleApiError, parseJsonBody } from "@/lib/api-validation";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";

export async function GET() {
  try {
    const auth = await requireGlobalPermission("knowledge.article.manage");
    if (!auth.authorized) return auth.response;

    const messages = await getMessages();
    return apiJsonResponse(messages);
  } catch (error) {
    return handleApiError(error, errors.FETCH_MESSAGES, "Error fetching messages");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireGlobalPermission("knowledge.article.manage", { rateLimit: AUTHENTICATED_MUTATION_LIMIT });
    if (!auth.authorized) return auth.response;

    const body = await parseJsonBody(request, predefinedMessageSchema);
    if (!body.success) return body.response;
    const message = await createMessage(body.data);
    return apiJsonResponse(message, { status: 201 });
  } catch (error) {
    return handleApiError(error, errors.CREATE_MESSAGE, "Error creating message");
  }
}
