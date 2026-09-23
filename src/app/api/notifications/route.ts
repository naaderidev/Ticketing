import { apiJsonResponse } from "@/lib/api-date-contract";
import { getNotifications } from "@/lib/notification-service";
import { errors } from "@/lib/strings";
import { requireAuthenticatedUser } from "@/lib/api-authorization";
import { notificationQuerySchema } from "@/lib/validations";
import { handleApiError, parseQuery } from "@/lib/api-validation";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    if (!auth.authorized) return auth.response;
    const authUser = auth.value;

    const { searchParams } = new URL(request.url);
    const query = parseQuery(searchParams, notificationQuerySchema);
    if (!query.success) return query.response;

    const result = await getNotifications({
      recipientType: authUser.role === "ADMIN" ? "ADMIN" : "USER",
      unreadOnly: query.data.unreadOnly,
      userId: authUser.role === "USER" ? authUser.id.toString() : undefined,
    });

    return apiJsonResponse(result);
  } catch (error) {
    return handleApiError(error, errors.FETCH_NOTIFICATIONS, "Error fetching notifications");
  }
}
