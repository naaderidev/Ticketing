import { requireSupportCatalogApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Error,
  apiV2ListSuccess,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import { parseApiV2Query } from "@/modules/shared/api-v2-validation";
import { getCustomerTicketTimeline } from "@/modules/tickets/application/ticket-service";
import { ticketTimelineV2QuerySchema } from "@/modules/tickets/contracts/ticket-schemas";
import { isTicketCommandError } from "@/modules/tickets/domain/ticket-command-error";
import { isSafeTicketIdentifier } from "@/modules/tickets/contracts/ticket-identifier";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const auth = await requireSupportCatalogApiV2User(request);
    if (!auth.authorized) return auth.response;
    const ticketId = (await params).ticketId;
    if (!isSafeTicketIdentifier(ticketId)) {
      return apiV2Error(request, "شناسه تیکت معتبر نیست", 400, "INVALID_PATH_PARAMETER");
    }
    const query = parseApiV2Query(
      request,
      new URL(request.url).searchParams,
      ticketTimelineV2QuerySchema
    );
    if (!query.success) return query.response;
    const result = await getCustomerTicketTimeline({
      user: auth.user,
      ticketId,
      query: query.data,
    });
    return apiV2ListSuccess(request, result.items, result.page);
  } catch (error) {
    if (isTicketCommandError(error)) {
      return apiV2Error(request, error.message, error.status, error.code);
    }
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت تاریخچه تیکت",
      "GET /api/v2/tickets/:ticketId/timeline"
    );
  }
}
