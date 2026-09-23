import { recordAuditEvent } from "@/lib/audit-log";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import {
  createKnowledgeArticle,
  listWorkspaceKnowledgeArticles,
} from "@/modules/knowledge/application/knowledge-service";
import {
  createKnowledgeArticleSchema,
  workspaceKnowledgeArticleQuerySchema,
} from "@/modules/knowledge/contracts/knowledge-schemas";
import { isKnowledgeError } from "@/modules/knowledge/domain/knowledge-error";
import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Error,
  apiV2ListSuccess,
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import { parseApiV2Json, parseApiV2Query } from "@/modules/shared/api-v2-validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requireWorkspaceApiV2User(request);
    if (!auth.authorized) return auth.response;
    const query = parseApiV2Query(
      request,
      new URL(request.url).searchParams,
      workspaceKnowledgeArticleQuerySchema
    );
    if (!query.success) return query.response;
    const articles = await listWorkspaceKnowledgeArticles({
      user: auth.user,
      query: query.data,
    });
    return apiV2ListSuccess(request, articles, {
      nextCursor: null,
      hasMore: false,
      limit: query.data.limit,
    });
  } catch (error) {
    if (isKnowledgeError(error)) {
      return apiV2Error(request, error.message, error.status, error.code);
    }
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت محتوای دانش",
      "GET /api/v2/workspace/knowledge/articles"
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireWorkspaceApiV2User(request, {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;
    const body = await parseApiV2Json(request, createKnowledgeArticleSchema);
    if (!body.success) return body.response;
    const article = await createKnowledgeArticle({
      user: auth.user,
      command: body.data,
    });
    await recordAuditEvent({
      request,
      action: "KNOWLEDGE_ARTICLE_CREATE",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      targetType: "KNOWLEDGE_ARTICLE",
      targetId: String(article.id),
    });
    return apiV2Success(request, article, { status: 201 });
  } catch (error) {
    if (isKnowledgeError(error)) {
      return apiV2Error(request, error.message, error.status, error.code);
    }
    return handleApiV2Error(
      request,
      error,
      "خطا در ایجاد مقاله دانش",
      "POST /api/v2/workspace/knowledge/articles"
    );
  }
}
