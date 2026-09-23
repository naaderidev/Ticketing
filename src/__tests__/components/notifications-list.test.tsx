import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { NotificationsList } from "@/components/shared/notifications-list";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/hooks";

jest.mock("@/hooks", () => ({
  useNotifications: jest.fn(),
  useMarkNotificationRead: jest.fn(),
  useMarkAllNotificationsRead: jest.fn(),
}));

const mockUseNotifications = useNotifications as jest.Mock;
const mockUseMarkNotificationRead = useMarkNotificationRead as jest.Mock;
const mockUseMarkAllNotificationsRead = useMarkAllNotificationsRead as jest.Mock;

describe("NotificationsList", () => {
  const refetch = jest.fn();

  beforeEach(() => {
    mockUseMarkNotificationRead.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
    mockUseMarkAllNotificationsRead.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
  });

  it("shows a retryable error instead of an empty state when loading fails", () => {
    mockUseNotifications.mockReturnValue({
      data: undefined,
      error: new Error("دریافت نوتیفیکیشن‌ها ناموفق بود"),
      isError: true,
      isFetching: false,
      isLoading: false,
      refetch,
    });

    render(<NotificationsList />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "دریافت نوتیفیکیشن‌ها ناموفق بود"
    );
    expect(screen.queryByText("نوتیفیکیشنی وجود ندارد")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "تلاش مجدد" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("links notifications with the public ticket identifier", () => {
    mockUseNotifications.mockReturnValue({
      data: {
        notifications: [
          {
            id: 1,
            message: "تیکت جدید نیازمند بررسی است.",
            isRead: false,
            ticketId: "TK-DEMO-0001",
            recipientType: "ADMIN",
            userId: null,
            createdAt: "2026-09-15T08:00:00.000Z",
          },
        ],
        unreadCount: 1,
      },
      error: null,
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch,
    });

    render(<NotificationsList />);

    expect(screen.getByRole("link", { name: /TK-DEMO-0001/ })).toHaveAttribute(
      "href",
      "/admin/tickets/TK-DEMO-0001"
    );
  });
});
