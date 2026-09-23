import { prisma } from "@/lib/prisma";
import {
  getNotifications,
  markAllAsRead,
  markAsRead,
} from "@/lib/notification-service";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

describe("notification service", () => {
  beforeEach(() => jest.clearAllMocks());

  it("applies filters and exposes the public ticket identifier", async () => {
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([
      {
        id: 1,
        ticketId: 99,
        userId: 7,
        recipientType: "USER",
        message: "پیام آزمایشی",
        isRead: false,
        createdAt: new Date("2026-09-15T08:00:00.000Z"),
        ticket: { ticketId: "TK-DEMO-0001" },
      },
    ]);
    (prisma.notification.count as jest.Mock).mockResolvedValue(1);

    await expect(
      getNotifications({ recipientType: "USER", userId: "7", unreadOnly: "true" })
    ).resolves.toEqual({
      notifications: [
        expect.objectContaining({
          id: 1,
          ticketId: "TK-DEMO-0001",
        }),
      ],
      unreadCount: 1,
    });

    const where = { recipientType: "USER", userId: 7, isRead: false };
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, take: 50 })
    );
    expect(prisma.notification.count).toHaveBeenCalledWith({ where });
  });

  it("uses the admin recipient as the default", async () => {
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.notification.count as jest.Mock).mockResolvedValue(0);

    await getNotifications({});
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { recipientType: "ADMIN" } })
    );
  });

  it("marks one notification as read", async () => {
    (prisma.notification.update as jest.Mock).mockResolvedValue({
      id: 4,
      ticketId: 99,
      userId: null,
      recipientType: "ADMIN",
      message: "پیام آزمایشی",
      isRead: true,
      createdAt: new Date("2026-09-15T08:00:00.000Z"),
      ticket: { ticketId: "TK-DEMO-0001" },
    });

    await expect(markAsRead(4)).resolves.toMatchObject({
      isRead: true,
      ticketId: "TK-DEMO-0001",
    });
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { isRead: true },
      include: { ticket: { select: { ticketId: true } } },
    });
  });

  it("marks only one user's unread notifications as read", async () => {
    (prisma.notification.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    await markAllAsRead({ recipientType: "USER", userId: "7" });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { isRead: false, userId: 7 },
      data: { isRead: true },
    });
  });

  it("marks unread admin notifications when there is no user owner", async () => {
    (prisma.notification.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    await markAllAsRead({});
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { isRead: false, recipientType: "ADMIN" },
      data: { isRead: true },
    });
  });
});
