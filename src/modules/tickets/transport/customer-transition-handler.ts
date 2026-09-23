import { recordAuditEvent } from "@/lib/audit-log";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { requireSupportTicketWriteApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Error,
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import { parseApiV2Json } from "@/modules/shared/api-v2-validation";
import {
  transitionCustomerTicket,
  type CustomerTicketTransition,
} from "@/modules/tickets/application/ticket-service";
import { parseIdempotencyKey } from "@/modules/tickets/contracts/idempotency-key";
import {
  emptyTicketCommandSchema,
  ticketReasonCommandSchema,
} from "@/modules/tickets/contracts/ticket-schemas";
import { isTicketCommandError } from "@/modules/tickets/domain/ticket-command-error";
import { ticketEtag } from "@/modules/tickets/domain/ticket-version";
import { isSafeTicketIdentifier } from "@/modules/tickets/contracts/ticket-identifier";

export async function handleCustomerTransition(
  request: Request,
  params: Promise<{ ticketId: string }>,
  transition: CustomerTicketTransition
) {
  try {
    const auth = await requireSupportTicketWriteApiV2User(request, {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
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
    const idempotencyKey = parseIdempotencyKey(request);
    if (!idempotencyKey.success) return idempotencyKey.response;
    const needsReason = transition !== "CONFIRM_RESOLUTION";
    const body = await parseApiV2Json(
      request,
      needsReason ? ticketReasonCommandSchema : emptyTicketCommandSchema
    );
    if (!body.success) return body.response;
    const reason = "reason" in body.data ? body.data.reason : undefined;
    const result = await transitionCustomerTicket({
      user: auth.user,
      ticketId,
      transition,
      reason,
      idempotencyKey: idempotencyKey.data,
      ifMatch: request.headers.get("if-match"),
    });
    await recordAuditEvent({
      request,
      action: `TICKET_V2_${transition}`,
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
      "خطا در تغییر وضعیت تیکت",
      `POST customer ticket transition ${transition}`
    );
  }
}
