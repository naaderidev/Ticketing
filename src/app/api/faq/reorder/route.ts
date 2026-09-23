import { apiJsonResponse } from "@/lib/api-date-contract";
import { reorderFaqs } from "@/lib/faq-service";
import { errors } from "@/lib/strings";
import { requireGlobalPermission } from "@/lib/api-authorization";
import { reorderFaqsSchema } from "@/lib/validations";
import { handleApiError, parseJsonBody } from "@/lib/api-validation";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";

export async function PUT(request: Request) {
  try {
    const auth = await requireGlobalPermission("knowledge.article.manage", { rateLimit: AUTHENTICATED_MUTATION_LIMIT });
    if (!auth.authorized) return auth.response;

    const body = await parseJsonBody(request, reorderFaqsSchema);
    if (!body.success) return body.response;
    await reorderFaqs(body.data.items);
    return apiJsonResponse({
      message: "اولویت‌ها با موفقیت بروزرسانی شدند",
    });
  } catch (error) {
    return handleApiError(error, errors.REORDER_FAQS, "Error reordering FAQs");
  }
}
