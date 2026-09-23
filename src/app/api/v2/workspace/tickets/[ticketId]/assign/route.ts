import { assignWorkspaceTicket } from "@/modules/tickets/application/workspace-ticket-service";
import { assignWorkspaceTicketSchema } from "@/modules/tickets/contracts/workspace-ticket-schemas";
import { handleWorkspaceCommand } from "@/modules/tickets/transport/workspace-command-handler";
export function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) { return handleWorkspaceCommand({ request, params, schema: assignWorkspaceTicketSchema, action: "WORKSPACE_TICKET_ASSIGN", operation: "POST workspace assign", fallbackMessage: "خطا در تخصیص تیکت", execute: assignWorkspaceTicket }); }
