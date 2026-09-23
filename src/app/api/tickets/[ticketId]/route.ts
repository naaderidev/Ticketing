import { apiJsonResponse } from "@/lib/api-date-contract";
import {
  getTicketByTicketId,
  updateTicket,
} from "@/lib/ticket-service";
import { errors } from "@/lib/strings";
import { requireTicketPermission } from "@/lib/api-authorization";
import { hasTicketPermission } from "@/lib/authorization-policy";
import { apiError, handleApiError, parseJsonBody, parseTicketIdentifier } from "@/lib/api-validation";
import { updateTicketSchema } from "@/lib/validations";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { recordAuditEvent } from "@/lib/audit-log";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params;
    const parsedTicketId = parseTicketIdentifier(ticketId);
    if (!parsedTicketId.success) return parsedTicketId.response;
    const access = await requireTicketPermission(parsedTicketId.data, "read");
    if (!access.authorized) return access.response;

    const ticket = await getTicketByTicketId(parsedTicketId.data);

    if (!ticket) {
      return apiError(errors.TICKET_NOT_FOUND, 404, "NOT_FOUND");
    }

    return apiJsonResponse(ticket);
  } catch (error) {
    return handleApiError(error, errors.FETCH_TICKET, "Error fetching ticket");
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params;
    const parsedTicketId = parseTicketIdentifier(ticketId);
    if (!parsedTicketId.success) return parsedTicketId.response;
    const access = await requireTicketPermission(parsedTicketId.data, "read", {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!access.authorized) return access.response;

    const body = await parseJsonBody(request, updateTicketSchema);
    if (!body.success) return body.response;
    const update = body.data;
    const requestedPermission =
      update.status === "CLOSED" &&
      update.departmentId === undefined &&
      update.subDepartmentId === undefined
        ? "close"
        : "manage";
    if (
      !hasTicketPermission(
        access.value.user,
        access.value.ticket,
        requestedPermission
      )
    ) {
      return apiError("دسترسی غیرمجاز", 403, "FORBIDDEN");
    }

    const isAdmin = access.value.user.role === "ADMIN";
    if (!isAdmin && update.status !== "CLOSED") {
      return apiError("دسترسی غیرمجاز", 403, "FORBIDDEN");
    }

    const updateData = isAdmin
      ? {
          ...update,
          closedBy: update.status === "CLOSED" ? ("ADMIN" as const) : undefined,
          actorUserId: access.value.user.id,
        }
      : {
          status: "CLOSED" as const,
          closedReason: update.closedReason,
          closedBy: "USER" as const,
          actorUserId: access.value.user.id,
        };
    const updated = await updateTicket(parsedTicketId.data, updateData);
    await recordAuditEvent({
      request,
      action: "TICKET_UPDATE",
      outcome: "SUCCESS",
      actorUserId: access.value.user.id,
      sessionId: access.value.user.sessionId,
      targetType: "TICKET",
      targetId: parsedTicketId.data,
      metadata: { status: updated.status },
    });
    return apiJsonResponse(updated);
  } catch (error) {
    return handleApiError(error, errors.UPDATE_TICKET, "Error updating ticket");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params;
    const parsedTicketId = parseTicketIdentifier(ticketId);
    if (!parsedTicketId.success) return parsedTicketId.response;
    const access = await requireTicketPermission(parsedTicketId.data, "delete", {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!access.authorized) return access.response;

    await recordAuditEvent({
      request,
      action: "TICKET_DELETE_BLOCKED",
      outcome: "DENIED",
      actorUserId: access.value.user.id,
      sessionId: access.value.user.sessionId,
      targetType: "TICKET",
      targetId: parsedTicketId.data,
    });
    return apiError(
      "حذف تیکت مجاز نیست؛ تیکت باید از چرخه حل و نگه‌داری قانونی عبور کند",
      409,
      "CONFLICT"
    );
  } catch (error) {
    return handleApiError(error, errors.DELETE_TICKET, "Error deleting ticket");
  }
}
