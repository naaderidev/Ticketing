import { approveWorkspaceAccountReview } from "@/modules/tickets/application/workspace-ticket-service";
import { decideAccountReviewSchema } from "@/modules/tickets/contracts/workspace-ticket-schemas";
import { handleWorkspaceCommand } from "@/modules/tickets/transport/workspace-command-handler";

export function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  return handleWorkspaceCommand({ request, params, schema: decideAccountReviewSchema, action: "ACCOUNT_REVIEW_APPROVE", operation: "POST account review approve", fallbackMessage: "خطا در تأیید مدیر حساب", execute: approveWorkspaceAccountReview });
}
