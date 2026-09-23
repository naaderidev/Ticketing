import { prisma } from "@/lib/prisma";
import { RecipientType, type Notification } from "@prisma/client";
import { rethrowPersistenceError } from "@/lib/domain-error";
import { errors } from "@/lib/strings";

interface NotificationFilters {
  recipientType?: string;
  unreadOnly?: string;
  userId?: string;
}

type NotificationWithTicket = Notification & {
  ticket: { ticketId: string };
};

const ticketReference = { ticket: { select: { ticketId: true } } } as const;

function toNotificationDto(notification: NotificationWithTicket) {
  const { ticket, ...record } = notification;
  return { ...record, ticketId: ticket.ticketId };
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
      include: ticketReference,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({
      where: { ...where, isRead: false },
    }),
  ]);

  return {
    notifications: notifications.map(toNotificationDto),
    unreadCount,
  };
}

export async function markAsRead(id: number) {
  try {
    const notification = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
      include: ticketReference,
    });
    return toNotificationDto(notification);
  } catch (error) {
    rethrowPersistenceError(error, { notFound: errors.NOTIFICATION_NOT_FOUND });
  }
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
