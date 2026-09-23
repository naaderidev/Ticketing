import { requestWorkspaceCustomerInput } from "@/modules/tickets/application/workspace-ticket-service";
import { requestCustomerInputSchema } from "@/modules/tickets/contracts/workspace-ticket-schemas";
import { handleWorkspaceCommand } from "@/modules/tickets/transport/workspace-command-handler";
export function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) { return handleWorkspaceCommand({ request, params, schema: requestCustomerInputSchema, action: "WORKSPACE_REQUEST_CUSTOMER_INPUT", operation: "POST workspace request customer input", fallbackMessage: "خطا در درخواست اطلاعات", execute: requestWorkspaceCustomerInput }); }
