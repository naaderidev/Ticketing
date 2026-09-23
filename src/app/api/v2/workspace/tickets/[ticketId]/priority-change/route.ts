import { changeWorkspaceTicketPriority } from "@/modules/tickets/application/workspace-ticket-service";
import { changeWorkspaceTicketPrioritySchema } from "@/modules/tickets/contracts/workspace-ticket-schemas";
import { handleWorkspaceCommand } from "@/modules/tickets/transport/workspace-command-handler";
export function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) { return handleWorkspaceCommand({ request, params, schema: changeWorkspaceTicketPrioritySchema, action: "WORKSPACE_TICKET_PRIORITY_CHANGE", operation: "POST workspace priority change", fallbackMessage: "خطا در تغییر اولویت", execute: changeWorkspaceTicketPriority }); }
