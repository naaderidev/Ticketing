import { resolveWorkspaceTicket } from "@/modules/tickets/application/workspace-ticket-service";
import { resolveWorkspaceTicketSchema } from "@/modules/tickets/contracts/workspace-ticket-schemas";
import { handleWorkspaceCommand } from "@/modules/tickets/transport/workspace-command-handler";
export function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) { return handleWorkspaceCommand({ request, params, schema: resolveWorkspaceTicketSchema, action: "WORKSPACE_TICKET_RESOLVE", operation: "POST workspace resolve", fallbackMessage: "خطا در حل تیکت", execute: resolveWorkspaceTicket }); }
