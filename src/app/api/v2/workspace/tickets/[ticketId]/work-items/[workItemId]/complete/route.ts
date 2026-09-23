import { completeWorkspaceWorkItem } from "@/modules/tickets/application/workspace-ticket-service";
import { completeWorkspaceWorkItemSchema } from "@/modules/tickets/contracts/workspace-ticket-schemas";
import { handleWorkspaceCommand } from "@/modules/tickets/transport/workspace-command-handler";
import { apiV2Error } from "@/modules/shared/api-v2-response";

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string; workItemId: string }> }) {
  const values = await params;
  if (!/^[1-9]\d{0,18}$/.test(values.workItemId) || BigInt(values.workItemId) > BigInt("9223372036854775807")) return apiV2Error(request, "شناسه همکاری معتبر نیست", 400, "INVALID_PATH_PARAMETER");
  const workItemId = BigInt(values.workItemId);
  return handleWorkspaceCommand({ request, params: Promise.resolve({ ticketId: values.ticketId }), schema: completeWorkspaceWorkItemSchema, action: "WORKSPACE_WORK_ITEM_COMPLETE", operation: "POST workspace work-item complete", fallbackMessage: "خطا در تکمیل همکاری", execute: (input) => completeWorkspaceWorkItem({ ...input, workItemId }) });
}
