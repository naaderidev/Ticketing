import { prisma } from "@/lib/prisma";
import { RecipientType } from "@prisma/client";

interface NotificationFilters {
  recipientType?: string;
  unreadOnly?: string;
  userId?: string;
}

export async function getNotifications(filters: NotificationFilters) {
  const { recipientType = "ADMIN", unreadOnly, userId } = filters;

  const where: Record<string, unknown> = {
    recipientType: recipientType as RecipientType,
  };

  if (userId) {
    where.userId = parseInt(userId);
  }

  if (unreadOnly === "true") {
    where.isRead = false;
  }

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      include: { ticket: { select: { ticketId: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({
      where: { ...where, isRead: false },
    }),
  ]);

  return { notifications, unreadCount };
}

export async function markAsRead(id: number) {
  return prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });
}

export async function markAllAsRead(filters: {
  recipientType?: string;
  userId?: string;
}) {
  const { recipientType = "ADMIN", userId } = filters;

  const where: Record<string, unknown> = { isRead: false };

  if (userId) {
    where.userId = parseInt(userId);
  } else {
    where.recipientType = recipientType as RecipientType;
  }

  await prisma.notification.updateMany({
    where,
    data: { isRead: true },
  });
}
