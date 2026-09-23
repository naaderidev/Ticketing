import { addWorkspaceCollaborator } from "@/modules/tickets/application/workspace-ticket-service";
import { addWorkspaceCollaboratorSchema } from "@/modules/tickets/contracts/workspace-ticket-schemas";
import { handleWorkspaceCommand } from "@/modules/tickets/transport/workspace-command-handler";
export function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) { return handleWorkspaceCommand({ request, params, schema: addWorkspaceCollaboratorSchema, action: "WORKSPACE_COLLABORATOR_ADD", operation: "POST workspace collaborator", fallbackMessage: "خطا در افزودن همکاری داخلی", execute: addWorkspaceCollaborator }); }
