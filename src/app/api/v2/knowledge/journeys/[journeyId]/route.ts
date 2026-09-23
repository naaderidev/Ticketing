import { z } from "zod";
import { getOwnedKnowledgeJourney } from "@/modules/knowledge/application/support-journey-service";
import { isKnowledgeError } from "@/modules/knowledge/domain/knowledge-error";
import { requireAutomatedResolutionApiV2User } from "@/modules/shared/api-v2-authorization";
import { apiV2Error, apiV2Success, handleApiV2Error } from "@/modules/shared/api-v2-response";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ journeyId: string }> }
) {
  try {
    const auth = await requireAutomatedResolutionApiV2User(request);
    if (!auth.authorized) return auth.response;
    const { journeyId } = await params;
    if (!z.uuid().safeParse(journeyId).success) {
      return apiV2Error(request, "شناسه Journey معتبر نیست", 400, "INVALID_PATH_PARAMETER");
    }
    return apiV2Success(request, await getOwnedKnowledgeJourney({ user: auth.user, journeyId }));
  } catch (error) {
    if (isKnowledgeError(error)) {
      return apiV2Error(request, error.message, error.status, error.code);
    }
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت زمینه راهنمای پشتیبانی",
      "GET /api/v2/knowledge/journeys/:journeyId"
    );
  }
}
