import { apiJsonResponse } from "@/lib/api-date-contract";
import { getFaqs, createFaq } from "@/lib/faq-service";
import { errors } from "@/lib/strings";
import { faqQuerySchema, faqSchema } from "@/lib/validations";
import { requireAuthenticatedUser, requireGlobalPermission } from "@/lib/api-authorization";
import { handleApiError, parseJsonBody, parseQuery } from "@/lib/api-validation";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const query = parseQuery(searchParams, faqQuerySchema);
    if (!query.success) return query.response;

    const faqs = await getFaqs(query.data);

    return apiJsonResponse(faqs);
  } catch (error) {
    return handleApiError(error, errors.FETCH_FAQS, "Error fetching FAQs");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireGlobalPermission("knowledge.article.manage", { rateLimit: AUTHENTICATED_MUTATION_LIMIT });
    if (!auth.authorized) return auth.response;

    const body = await parseJsonBody(request, faqSchema);
    if (!body.success) return body.response;
    const faq = await createFaq(body.data);
    return apiJsonResponse(faq, { status: 201 });
  } catch (error) {
    return handleApiError(error, errors.CREATE_FAQ, "Error creating FAQ");
  }
}
