import { apiJsonResponse } from "@/lib/api-date-contract";
import { markAllAsRead } from "@/lib/notification-service";
import { errors } from "@/lib/strings";
import { requireAuthenticatedUser } from "@/lib/api-authorization";
import { handleApiError } from "@/lib/api-validation";
import { emptyQuerySchema } from "@/lib/validations";
import { parseQuery } from "@/lib/api-validation";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";

export async function PUT(request: Request) {
  try {
    const auth = await requireAuthenticatedUser({
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;
    const query = parseQuery(new URL(request.url).searchParams, emptyQuerySchema);
    if (!query.success) return query.response;

    await markAllAsRead({
      recipientType: auth.value.role === "ADMIN" ? "ADMIN" : "USER",
      userId:
        auth.value.role === "USER" ? auth.value.id.toString() : undefined,
    });

    return apiJsonResponse({ message: "تمام نوتیفیکیشن‌ها خوانده شدند" });
  } catch (error) {
    return handleApiError(error, errors.UPDATE_NOTIFICATIONS, "Error updating notifications");
  }
}
