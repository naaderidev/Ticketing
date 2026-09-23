import { recordAuditEvent } from "@/lib/audit-log";
import { getSupportManagementSnapshot } from "@/modules/support-catalog/application/support-catalog-service";
import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";

export async function GET(request: Request) {
  try {
    const auth = await requireWorkspaceApiV2User(request);
    if (!auth.authorized) return auth.response;

    const snapshot = await getSupportManagementSnapshot(auth.user.id);
    await recordAuditEvent({
      request,
      action: "SUPPORT_CATALOG_MANAGEMENT_VIEW",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      targetType: "SUPPORT_CATALOG",
    });
    return apiV2Success(request, snapshot);
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت مدیریت کاتالوگ پشتیبانی",
      "GET /api/v2/workspace/catalog"
    );
  }
}
