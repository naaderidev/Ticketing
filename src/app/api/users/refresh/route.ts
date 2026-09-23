import { apiJsonResponse } from "@/lib/api-date-contract";
import { refreshAuthSession, removeAuthCookie } from "@/lib/auth";
import { requireAuthenticatedUser } from "@/lib/api-authorization";
import { apiError, handleApiError } from "@/lib/api-validation";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";

export async function POST() {
  try {
    const auth = await requireAuthenticatedUser({
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;

    const refreshed = await refreshAuthSession({
      userId: auth.value.id,
      sessionId: auth.value.sessionId,
    });
    if (!refreshed) {
      await removeAuthCookie();
      return apiError("نشست کاربری معتبر نیست", 401, "UNAUTHORIZED");
    }

    return apiJsonResponse({ refreshed: true });
  } catch (error) {
    return handleApiError(
      error,
      "خطا در بروزرسانی نشست",
      "Error refreshing session"
    );
  }
}
