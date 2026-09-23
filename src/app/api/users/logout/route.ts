import { apiJsonResponse } from "@/lib/api-date-contract";
import { removeAuthCookie, revokeCurrentSession } from "@/lib/auth";
import { handleApiError } from "@/lib/api-validation";
import { getCurrentUser } from "@/lib/current-user";
import { recordAuditEvent } from "@/lib/audit-log";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const sessionId = await revokeCurrentSession();
    await removeAuthCookie();
    if (user && sessionId) {
      await recordAuditEvent({
        request,
        action: "AUTH_LOGOUT",
        outcome: "SUCCESS",
        actorUserId: user.id,
        sessionId,
      });
    }
    return apiJsonResponse({ success: true });
  } catch (error) {
    await removeAuthCookie();
    return handleApiError(error, "خطا در خروج از سیستم", "Error logging out");
  }
}
