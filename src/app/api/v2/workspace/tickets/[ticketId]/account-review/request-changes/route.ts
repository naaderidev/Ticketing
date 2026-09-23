import { requestWorkspaceAccountReviewChanges } from "@/modules/tickets/application/workspace-ticket-service";
import { decideAccountReviewSchema } from "@/modules/tickets/contracts/workspace-ticket-schemas";
import { handleWorkspaceCommand } from "@/modules/tickets/transport/workspace-command-handler";

export function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  return handleWorkspaceCommand({ request, params, schema: decideAccountReviewSchema, action: "ACCOUNT_REVIEW_REQUEST_CHANGES", operation: "POST account review request changes", fallbackMessage: "خطا در بازگرداندن نتیجه", execute: requestWorkspaceAccountReviewChanges });
}
