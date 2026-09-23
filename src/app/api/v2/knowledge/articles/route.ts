import { listCustomerKnowledgeArticles } from "@/modules/knowledge/application/customer-knowledge-service";
import { customerKnowledgeArticleQuerySchema } from "@/modules/knowledge/contracts/knowledge-schemas";
import { requireAutomatedResolutionApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2ListSuccess,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import { parseApiV2Query } from "@/modules/shared/api-v2-validation";

export async function GET(request: Request) {
  try {
    const auth = await requireAutomatedResolutionApiV2User(request);
    if (!auth.authorized) return auth.response;
    const query = parseApiV2Query(
      request,
      new URL(request.url).searchParams,
      customerKnowledgeArticleQuerySchema
    );
    if (!query.success) return query.response;

    const articles = await listCustomerKnowledgeArticles({
      user: auth.user,
      query: query.data,
    });
    return apiV2ListSuccess(request, articles, {
      nextCursor: null,
      hasMore: false,
      limit: query.data.limit,
    });
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت محتوای مرکز پشتیبانی",
      "GET /api/v2/knowledge/articles"
    );
  }
}
