import { recordAuditEvent } from "@/lib/audit-log";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { publishKnowledgeArticle } from "@/modules/knowledge/application/knowledge-service";
import { publishKnowledgeArticleSchema } from "@/modules/knowledge/contracts/knowledge-schemas";
import { isKnowledgeError } from "@/modules/knowledge/domain/knowledge-error";
import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Error,
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import {
  parseApiV2Json,
  parseApiV2PositiveInteger,
} from "@/modules/shared/api-v2-validation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ articleId: string }> }
) {
  try {
    const auth = await requireWorkspaceApiV2User(request, {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;
    const path = parseApiV2PositiveInteger(
      request,
      (await params).articleId,
      "شناسه مقاله"
    );
    if (!path.success) return path.response;
    const body = await parseApiV2Json(request, publishKnowledgeArticleSchema);
    if (!body.success) return body.response;
    const result = await publishKnowledgeArticle({
      user: auth.user,
      articleId: path.data,
      command: body.data,
    });
    await recordAuditEvent({
      request,
      action: "KNOWLEDGE_ARTICLE_PUBLISH",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      targetType: "KNOWLEDGE_ARTICLE",
      targetId: String(path.data),
      metadata: { replayed: result.replayed, version: body.data.version },
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
      "خطا در انتشار مقاله دانش",
      "POST /api/v2/workspace/knowledge/articles/:articleId/publish"
    );
  }
}
