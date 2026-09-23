import { apiJsonResponse } from "@/lib/api-date-contract";
import { markAsRead } from "@/lib/notification-service";
import { errors } from "@/lib/strings";
import { requireNotificationAccess } from "@/lib/api-authorization";
import { handleApiError, parsePositiveInteger } from "@/lib/api-validation";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsedId = parsePositiveInteger(id, "شناسه اعلان");
    if (!parsedId.success) return parsedId.response;
    const notificationId = parsedId.data;

    const access = await requireNotificationAccess(notificationId, {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!access.authorized) return access.response;

    const notification = await markAsRead(notificationId);
    return apiJsonResponse(notification);
  } catch (error) {
    return handleApiError(error, errors.UPDATE_NOTIFICATION, "Error updating notification");
  }
}
