import type { Prisma } from "@prisma/client";

export const publicAttachmentSelect = {
  id: true,
  fileName: true,
  fileSize: true,
  fileType: true,
  createdAt: true,
} satisfies Prisma.TicketAttachmentSelect;

export type PublicAttachmentRecord = Prisma.TicketAttachmentGetPayload<{
  select: typeof publicAttachmentSelect;
}>;

export function toAttachmentDto(attachment: PublicAttachmentRecord) {
  return {
    ...attachment,
    fileUrl: `/api/attachments/${attachment.id}`,
  };
}
