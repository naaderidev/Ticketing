import { mergeWorkspaceTicket } from "@/modules/tickets/application/workspace-ticket-service";
import { mergeWorkspaceTicketSchema } from "@/modules/tickets/contracts/workspace-ticket-schemas";
import { handleWorkspaceCommand } from "@/modules/tickets/transport/workspace-command-handler";

export function POST(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  return handleWorkspaceCommand({
    request,
    params,
    schema: mergeWorkspaceTicketSchema,
    action: "WORKSPACE_TICKET_MERGE",
    operation: "POST workspace merge",
    fallbackMessage: "خطا در ادغام تیکت",
    execute: mergeWorkspaceTicket,
  });
}
