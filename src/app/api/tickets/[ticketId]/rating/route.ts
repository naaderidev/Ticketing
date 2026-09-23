import { apiJsonResponse } from "@/lib/api-date-contract";
import { rateTicket } from "@/lib/ticket-service";
import { errors } from "@/lib/strings";
import { ratingSchema } from "@/lib/validations";
import { requireTicketPermission } from "@/lib/api-authorization";
import { handleApiError, parseJsonBody, parseTicketIdentifier } from "@/lib/api-validation";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params;
    const parsedTicketId = parseTicketIdentifier(ticketId);
    if (!parsedTicketId.success) return parsedTicketId.response;
    const access = await requireTicketPermission(parsedTicketId.data, "rate", {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!access.authorized) return access.response;
    const body = await parseJsonBody(request, ratingSchema);
    if (!body.success) return body.response;
    const ratingResult = await rateTicket(
      parsedTicketId.data,
      body.data.rating,
      access.value.user.id
    );
    return apiJsonResponse(ratingResult);
  } catch (error) {
    return handleApiError(error, errors.CREATE_RATING, "Error creating rating");
  }
}
