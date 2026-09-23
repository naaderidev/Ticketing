import { getWorkspaceQueues } from "@/modules/support-catalog/application/support-catalog-service";
import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";

export async function GET(request: Request) {
  try {
    const auth = await requireWorkspaceApiV2User(request);
    if (!auth.authorized) return auth.response;

    const queues = await getWorkspaceQueues({ actorUserId: auth.user.id });
    return apiV2Success(request, queues);
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت صف‌های کاری",
      "GET /api/v2/workspace/queues"
    );
  }
}
