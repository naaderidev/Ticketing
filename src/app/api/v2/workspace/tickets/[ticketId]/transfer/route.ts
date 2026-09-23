import { transferWorkspaceTicket } from "@/modules/tickets/application/workspace-ticket-service";
import { transferWorkspaceTicketSchema } from "@/modules/tickets/contracts/workspace-ticket-schemas";
import { handleWorkspaceCommand } from "@/modules/tickets/transport/workspace-command-handler";
export function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) { return handleWorkspaceCommand({ request, params, schema: transferWorkspaceTicketSchema, action: "WORKSPACE_TICKET_TRANSFER", operation: "POST workspace transfer", fallbackMessage: "خطا در انتقال تیکت", execute: transferWorkspaceTicket }); }
