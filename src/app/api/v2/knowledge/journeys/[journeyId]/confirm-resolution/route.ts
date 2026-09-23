import { z } from "zod";
import { recordAuditEvent } from "@/lib/audit-log";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { confirmKnowledgeResolution } from "@/modules/knowledge/application/support-journey-service";
import { confirmKnowledgeResolutionSchema } from "@/modules/knowledge/contracts/knowledge-schemas";
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ journeyId: string }> }
) {
  try {
    const auth = await requireAutomatedResolutionApiV2User(request, {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;
    const { journeyId } = await params;
    if (!z.uuid().safeParse(journeyId).success) {
      return apiV2Error(request, "شناسه Journey معتبر نیست", 400, "INVALID_PATH_PARAMETER");
    }
    const idempotencyKey = parseIdempotencyKey(request);
    if (!idempotencyKey.success) return idempotencyKey.response;
    const body = await parseApiV2Json(request, confirmKnowledgeResolutionSchema);
    if (!body.success) return body.response;

    const result = await confirmKnowledgeResolution({
      user: auth.user,
      journeyId,
      idempotencyKey: idempotencyKey.data,
    });
    await recordAuditEvent({
      request,
      action: "KNOWLEDGE_JOURNEY_CONFIRM_RESOLUTION",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      targetType: "SUPPORT_JOURNEY",
      targetId: journeyId,
      metadata: { replayed: result.replayed },
    });
    return apiV2Success(request, result, {
      headers: result.replayed ? { "Idempotency-Replayed": "true" } : undefined,
    });
  } catch (error) {
    if (isKnowledgeError(error)) {
      return apiV2Error(request, error.message, error.status, error.code);
    }
    return handleApiV2Error(
      request,
      error,
      "خطا در ثبت نتیجه راهنمای حل خودکار",
      "POST /api/v2/knowledge/journeys/:journeyId/confirm-resolution"
    );
  }
}
