import { recordAuditEvent } from "@/lib/audit-log";
import { requireSupportCatalogApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Error,
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import { getCustomerTicket } from "@/modules/tickets/application/ticket-service";
import { isTicketCommandError } from "@/modules/tickets/domain/ticket-command-error";
import { ticketEtag } from "@/modules/tickets/domain/ticket-version";
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
      return apiV2Error(
        request,
        "شناسه تیکت معتبر نیست",
        400,
        "INVALID_PATH_PARAMETER"
      );
    }

    const ticket = await getCustomerTicket({ user: auth.user, ticketId });
    await recordAuditEvent({
      request,
      action: "TICKET_V2_VIEW",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      targetType: "TICKET",
      targetId: ticket.ticketId,
    });
    return apiV2Success(request, ticket, {
      headers: { ETag: ticketEtag(ticket.ticketId, ticket.version) },
    });
  } catch (error) {
    if (isTicketCommandError(error)) {
      return apiV2Error(request, error.message, error.status, error.code);
    }
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت تیکت",
      "GET /api/v2/tickets/:ticketId"
    );
  }
}
