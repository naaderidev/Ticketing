import { apiJsonResponse } from "@/lib/api-date-contract";
import { getTickets, createTicket } from "@/lib/ticket-service";
import { errors } from "@/lib/strings";
import { createTicketSchema, ticketQuerySchema } from "@/lib/validations";
import { requireAuthenticatedUser } from "@/lib/api-authorization";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError, parseJsonBody, parseQuery } from "@/lib/api-validation";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { recordAuditEvent } from "@/lib/audit-log";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    if (!auth.authorized) return auth.response;
    const authUser = auth.value;

    const { searchParams } = new URL(request.url);
    const query = parseQuery(searchParams, ticketQuerySchema);
    if (!query.success) return query.response;

    const result = await getTickets({
      ...query.data,
      userId: authUser.role === "ADMIN" ? query.data.userId : authUser.id.toString(),
    });

    return apiJsonResponse(result);
  } catch (error) {
    return handleApiError(error, errors.FETCH_TICKETS, "Error fetching tickets");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser({
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;
    const authUser = auth.value;

    const body = await parseJsonBody(request, createTicketSchema);
    if (!body.success) return body.response;

    let ticketOwner = authUser;
    if (authUser.role === "ADMIN" && body.data.userId) {
      const requestedOwner = await prisma.user.findUnique({
        where: { id: body.data.userId },
        select: {
          id: true,
          mobile: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      });
      if (!requestedOwner) {
        return apiError("کاربر یافت نشد", 404, "NOT_FOUND");
      }
      ticketOwner = { ...requestedOwner, sessionId: authUser.sessionId };
    }

    const ticket = await createTicket({
      subject: body.data.subject,
      message: body.data.message,
      departmentId: body.data.departmentId,
      subDepartmentId: body.data.subDepartmentId,
      attachments: body.data.attachments,
      attachmentUploaderId: authUser.id,
      userName: `${ticketOwner.firstName} ${ticketOwner.lastName}`.trim(),
      userId: ticketOwner.id,
      actorUserId: authUser.id,
      actorType: authUser.role === "ADMIN" ? "STAFF" : "USER",
    });
    await recordAuditEvent({
      request,
      action: "TICKET_CREATE",
      outcome: "SUCCESS",
      actorUserId: authUser.id,
      sessionId: authUser.sessionId,
      targetType: "TICKET",
      targetId: ticket.ticketId,
    });
    return apiJsonResponse(ticket, { status: 201 });
  } catch (error) {
    return handleApiError(error, errors.CREATE_TICKET, "Error creating ticket");
  }
}
