import { addWorkspaceInternalNote } from "@/modules/tickets/application/workspace-ticket-service";
import { workspaceMessageSchema } from "@/modules/tickets/contracts/workspace-ticket-schemas";
import { handleWorkspaceCommand } from "@/modules/tickets/transport/workspace-command-handler";
export function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) { return handleWorkspaceCommand({ request, params, schema: workspaceMessageSchema, action: "WORKSPACE_INTERNAL_NOTE", operation: "POST workspace internal note", fallbackMessage: "خطا در ثبت یادداشت داخلی", execute: addWorkspaceInternalNote }); }
