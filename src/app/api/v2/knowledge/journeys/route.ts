import { recordAuditEvent } from "@/lib/audit-log";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { getRequestId } from "@/lib/request-security";
import { startKnowledgeJourney } from "@/modules/knowledge/application/support-journey-service";
import { startKnowledgeJourneySchema } from "@/modules/knowledge/contracts/knowledge-schemas";
import { isKnowledgeError } from "@/modules/knowledge/domain/knowledge-error";
import { requireAutomatedResolutionApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Error,
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import { parseApiV2Json } from "@/modules/shared/api-v2-validation";
import { parseIdempotencyKey } from "@/modules/tickets/contracts/idempotency-key";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireAutomatedResolutionApiV2User(request, {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;
    const idempotencyKey = parseIdempotencyKey(request);
    if (!idempotencyKey.success) return idempotencyKey.response;
    const body = await parseApiV2Json(request, startKnowledgeJourneySchema);
    if (!body.success) return body.response;

    const result = await startKnowledgeJourney({
      user: auth.user,
      articleId: body.data.articleId,
      question: body.data.question,
      idempotencyKey: idempotencyKey.data,
    });
    await recordAuditEvent({
      request,
      action: "KNOWLEDGE_JOURNEY_START",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      targetType: "SUPPORT_JOURNEY",
      targetId: result.journey.id,
      metadata: { replayed: result.replayed, requestId: getRequestId(request) },
    });
    return apiV2Success(request, result, {
      status: result.replayed ? 200 : 201,
      headers: result.replayed ? { "Idempotency-Replayed": "true" } : undefined,
    });
  } catch (error) {
    if (isKnowledgeError(error)) {
      return apiV2Error(request, error.message, error.status, error.code);
    }
    return handleApiV2Error(
      request,
      error,
      "خطا در شروع راهنمای حل خودکار",
      "POST /api/v2/knowledge/journeys"
    );
  }
}
