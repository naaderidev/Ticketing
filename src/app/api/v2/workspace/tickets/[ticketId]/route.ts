import { recordAuditEvent } from "@/lib/audit-log";
import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import { apiV2Error, apiV2Success, handleApiV2Error } from "@/modules/shared/api-v2-response";
import { getWorkspaceTicket } from "@/modules/tickets/application/workspace-ticket-service";
import { isSafeTicketIdentifier } from "@/modules/tickets/contracts/ticket-identifier";
import { ticketEtag } from "@/modules/tickets/domain/ticket-version";

export async function GET(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const auth = await requireWorkspaceApiV2User(request);
    if (!auth.authorized) return auth.response;
    const ticketId = (await params).ticketId;
    if (!isSafeTicketIdentifier(ticketId)) return apiV2Error(request, "شناسه تیکت معتبر نیست", 400, "INVALID_PATH_PARAMETER");
    const ticket = await getWorkspaceTicket(auth.user.id, ticketId);
    await recordAuditEvent({ request, action: "WORKSPACE_TICKET_VIEW", outcome: "SUCCESS", actorUserId: auth.user.id, sessionId: auth.user.sessionId, targetType: "TICKET", targetId: ticketId });
    return apiV2Success(request, ticket, { headers: { ETag: ticketEtag(ticket.ticketId, ticket.version) } });
  } catch (error) {
    return handleApiV2Error(request, error, "خطا در دریافت تیکت", "GET /api/v2/workspace/tickets/:ticketId");
  }
}
