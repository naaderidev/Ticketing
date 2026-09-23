import { recordAuditEvent } from "@/lib/audit-log";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { requireSupportTicketWriteApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Error,
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import { parseApiV2Json } from "@/modules/shared/api-v2-validation";
import { rateCustomerTicket } from "@/modules/tickets/application/ticket-service";
import { parseIdempotencyKey } from "@/modules/tickets/contracts/idempotency-key";
import { rateTicketV2Schema } from "@/modules/tickets/contracts/ticket-schemas";
import { isTicketCommandError } from "@/modules/tickets/domain/ticket-command-error";
import { ticketEtag } from "@/modules/tickets/domain/ticket-version";
import { isSafeTicketIdentifier } from "@/modules/tickets/contracts/ticket-identifier";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const auth = await requireSupportTicketWriteApiV2User(request, {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;
    const ticketId = (await params).ticketId;
    if (!isSafeTicketIdentifier(ticketId)) {
      return apiV2Error(request, "شناسه تیکت معتبر نیست", 400, "INVALID_PATH_PARAMETER");
    }
    const idempotencyKey = parseIdempotencyKey(request);
    if (!idempotencyKey.success) return idempotencyKey.response;
    const body = await parseApiV2Json(request, rateTicketV2Schema);
    if (!body.success) return body.response;
    const result = await rateCustomerTicket({
      user: auth.user,
      ticketId,
      rating: body.data.rating,
      idempotencyKey: idempotencyKey.data,
      ifMatch: request.headers.get("if-match"),
    });
    await recordAuditEvent({
      request,
      action: "TICKET_V2_RATE",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      targetType: "TICKET",
      targetId: ticketId,
      metadata: { replayed: result.replayed },
    });
    return apiV2Success(request, result.ticket, {
      headers: {
        ETag: ticketEtag(result.ticket.ticketId, result.ticket.version),
        ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}),
      },
    });
  } catch (error) {
    if (isTicketCommandError(error)) {
      return apiV2Error(request, error.message, error.status, error.code);
    }
    return handleApiV2Error(
      request,
      error,
      "خطا در ثبت امتیاز",
      "POST /api/v2/tickets/:ticketId/rating"
    );
  }
}
