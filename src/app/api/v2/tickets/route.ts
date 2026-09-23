import { recordAuditEvent } from "@/lib/audit-log";
import { getRequestId } from "@/lib/request-security";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import {
  requireSupportCatalogApiV2User,
  requireSupportTicketWriteApiV2User,
} from "@/modules/shared/api-v2-authorization";
import {
  apiV2Error,
  apiV2ListSuccess,
  apiV2Success,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import {
  parseApiV2Json,
  parseApiV2Query,
} from "@/modules/shared/api-v2-validation";
import {
  createCustomerTicket,
  listCustomerTickets,
} from "@/modules/tickets/application/ticket-service";
import { parseIdempotencyKey } from "@/modules/tickets/contracts/idempotency-key";
import {
  createTicketV2Schema,
  ticketListV2QuerySchema,
} from "@/modules/tickets/contracts/ticket-schemas";
import { isTicketCommandError } from "@/modules/tickets/domain/ticket-command-error";
import { ticketEtag } from "@/modules/tickets/domain/ticket-version";
import { isKnowledgeError } from "@/modules/knowledge/domain/knowledge-error";

export async function GET(request: Request) {
  try {
    const auth = await requireSupportCatalogApiV2User(request);
    if (!auth.authorized) return auth.response;
    const query = parseApiV2Query(
      request,
      new URL(request.url).searchParams,
      ticketListV2QuerySchema
    );
    if (!query.success) return query.response;

    const result = await listCustomerTickets({
      user: auth.user,
      query: query.data,
    });
    return apiV2ListSuccess(request, result.tickets, result.page);
  } catch (error) {
    if (isTicketCommandError(error)) {
      return apiV2Error(request, error.message, error.status, error.code);
    }
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت تیکت‌ها",
      "GET /api/v2/tickets"
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireSupportTicketWriteApiV2User(request, {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;
    const idempotencyKey = parseIdempotencyKey(request);
    if (!idempotencyKey.success) return idempotencyKey.response;
    const body = await parseApiV2Json(request, createTicketV2Schema);
    if (!body.success) return body.response;

    const result = await createCustomerTicket({
      user: auth.user,
      command: body.data,
      idempotencyKey: idempotencyKey.data,
      requestId: getRequestId(request),
    });
    await recordAuditEvent({
      request,
      action: "TICKET_V2_CREATE",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      targetType: "TICKET",
      targetId: result.ticket.ticketId,
      metadata: { replayed: result.replayed },
    });
    return apiV2Success(request, result.ticket, {
      status: result.replayed ? 200 : 201,
      headers: {
        ETag: ticketEtag(result.ticket.ticketId, result.ticket.version),
        ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}),
      },
    });
  } catch (error) {
    if (isKnowledgeError(error)) {
      return apiV2Error(request, error.message, error.status, error.code);
    }
    if (isTicketCommandError(error)) {
      return apiV2Error(request, error.message, error.status, error.code);
    }
    return handleApiV2Error(
      request,
      error,
      "خطا در ثبت تیکت",
      "POST /api/v2/tickets"
    );
  }
}
