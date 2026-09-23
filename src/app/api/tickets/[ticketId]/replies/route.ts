import { apiJsonResponse } from "@/lib/api-date-contract";
import { prisma } from "@/lib/prisma";
import { addReply } from "@/lib/ticket-service";
import { errors } from "@/lib/strings";
import { replySchema } from "@/lib/validations";
import { requireTicketPermission } from "@/lib/api-authorization";
import { handleApiError, parseJsonBody, parseTicketIdentifier } from "@/lib/api-validation";
import { publicAttachmentSelect, toAttachmentDto } from "@/lib/attachment-dto";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";

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

    const replies = await prisma.ticketReply.findMany({
      where: { ticketId: access.value.ticket.id },
      include: { attachments: { select: publicAttachmentSelect } },
      orderBy: { createdAt: "asc" },
    });

    return apiJsonResponse(
      replies.map((reply) => ({
        ...reply,
        attachments: reply.attachments.map(toAttachmentDto),
      }))
    );
  } catch (error) {
    return handleApiError(error, errors.FETCH_REPLIES, "Error fetching replies");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params;
    const parsedTicketId = parseTicketIdentifier(ticketId);
    if (!parsedTicketId.success) return parsedTicketId.response;
    const access = await requireTicketPermission(parsedTicketId.data, "reply", {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!access.authorized) return access.response;

    const body = await parseJsonBody(request, replySchema);
    if (!body.success) return body.response;
    const actor = access.value.user;
    const reply = await addReply(parsedTicketId.data, {
      ...body.data,
      senderType: actor.role,
      senderName: `${actor.firstName} ${actor.lastName}`.trim(),
      attachmentUploaderId: actor.id,
      actorUserId: actor.id,
    });
    return apiJsonResponse(reply, { status: 201 });
  } catch (error) {
    return handleApiError(error, errors.CREATE_REPLY, "Error creating reply");
  }
}
