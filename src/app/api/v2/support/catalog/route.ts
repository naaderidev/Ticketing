import { getCustomerSupportCatalog } from "@/modules/support-catalog/application/support-catalog-service";
import { requireSupportCatalogApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";

export async function GET(request: Request) {
  try {
    const auth = await requireSupportCatalogApiV2User(request);
    if (!auth.authorized) return auth.response;

    return apiV2Success(request, await getCustomerSupportCatalog());
  } catch (error) {
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت کاتالوگ پشتیبانی",
      "GET /api/v2/support/catalog"
    );
  }
}
