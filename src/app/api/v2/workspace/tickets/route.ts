import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import { apiV2Error, apiV2ListSuccess, handleApiV2Error } from "@/modules/shared/api-v2-response";
import { parseApiV2Query } from "@/modules/shared/api-v2-validation";
import { listWorkspaceTickets } from "@/modules/tickets/application/workspace-ticket-service";
import { workspaceTicketListQuerySchema } from "@/modules/tickets/contracts/workspace-ticket-schemas";
import { isTicketCommandError } from "@/modules/tickets/domain/ticket-command-error";

export async function GET(request: Request) {
  try {
    const auth = await requireWorkspaceApiV2User(request);
    if (!auth.authorized) return auth.response;
    const query = parseApiV2Query(request, new URL(request.url).searchParams, workspaceTicketListQuerySchema);
    if (!query.success) return query.response;
    const result = await listWorkspaceTickets({ actorUserId: auth.user.id, query: query.data });
    return apiV2ListSuccess(request, result.tickets, result.page);
  } catch (error) {
    if (isTicketCommandError(error)) return apiV2Error(request, error.message, error.status, error.code);
    return handleApiV2Error(request, error, "خطا در دریافت صف تیکت‌ها", "GET /api/v2/workspace/tickets");
  }
}
