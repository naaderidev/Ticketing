import { getMessages } from "@/lib/message-service";
import {
  hasAnySupportPermission,
  SUPPORT_PERMISSIONS,
} from "@/modules/support-catalog/application/support-authorization";
import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Error,
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";

export async function GET(request: Request) {
  try {
    const auth = await requireWorkspaceApiV2User(request);
    if (!auth.authorized) return auth.response;

    const [hasWorkspaceAccess, canReply] = await Promise.all([
      hasAnySupportPermission(
        auth.user.id,
        SUPPORT_PERMISSIONS.WORKSPACE_ACCESS
      ),
      hasAnySupportPermission(auth.user.id, SUPPORT_PERMISSIONS.TICKET_REPLY),
    ]);
    if (!hasWorkspaceAccess || !canReply) {
      return apiV2Error(request, "دسترسی به پاسخ‌های آماده مجاز نیست", 403, "FORBIDDEN");
    }

    const messages = await getMessages();
    return apiV2Success(
      request,
      messages.map((message) => ({
        id: message.id,
        title: message.title,
        content: message.content,
        shortCode: message.shortCode,
        category: message.subDepartment?.name ?? "عمومی",
      }))
    );
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت پاسخ‌های آماده",
      "GET /api/v2/workspace/predefined-messages"
    );
  }
}
