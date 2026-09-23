import { handleCustomerTransition } from "@/modules/tickets/transport/customer-transition-handler";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  return handleCustomerTransition(request, params, "REOPEN");
}
