"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { labels } from "@/lib/strings";
import { toPersianDigits, formatRelativeTime } from "@/lib/format";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks";
import { toast } from "sonner";
import { useUser } from "@/contexts/user-context";

import React from "react";

interface NotificationBellProps {
  recipientType: "USER" | "ADMIN";
}

export const NotificationBell = React.memo(function NotificationBell({
  recipientType,
}: Readonly<NotificationBellProps>) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useUser();
  const userId = recipientType === "USER" ? user?.id : undefined;

  // React Query hooks
  const { data: notificationData, isLoading } = useNotifications(userId);
  const markNotificationReadMutation = useMarkNotificationRead();
  const markAllNotificationsReadMutation = useMarkAllNotificationsRead();

  const notifications = notificationData?.notifications || [];
  const unreadCount = notificationData?.unreadCount || 0;

  const markAsRead = useCallback(async (id: number) => {
    markNotificationReadMutation.mutate(id, {
      onError: () => {
        toast.error("خطا در بروزرسانی نوتیفیکیشن");
      },
    });
  }, [markNotificationReadMutation]);

  const handleClick = useCallback(async (notification: { id: number; isRead: boolean; ticketId: number }) => {
    if (!notification.isRead) {
      await markAsRead(notification.id);
    }
    setIsOpen(false);
    const basePath = recipientType === "ADMIN" ? "/admin" : "/user";
    router.push(`${basePath}/tickets/${notification.ticketId}`);
  }, [markAsRead, recipientType, router]);

  const markAllAsRead = useCallback(async () => {
    markAllNotificationsReadMutation.mutate(userId, {
      onSuccess: () => {
        toast.success("همه نوتیفیکیشن‌ها خوانده شد");
      },
      onError: () => {
        toast.error("خطا در بروزرسانی نوتیفیکیشن");
      },
    });
  }, [markAllNotificationsReadMutation, userId]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -left-1 -top-1 h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs"
            >
              {unreadCount > 99 ? "۹۹+" : toPersianDigits(unreadCount)}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="font-semibold">{labels.NAV_NOTIFICATIONS}</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              disabled={markAllNotificationsReadMutation.isPending}
              className="text-xs"
            >
              <CheckCheck className="ml-1 h-3 w-3" />
              {labels.NOTIFICATION_ALL_READ}
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="mb-2 h-8 w-8 opacity-50" />
              <p className="text-sm">{labels.EMPTY_NOTIFICATIONS}</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                    !notification.isRead && "bg-muted/30",
                  )}
                  onClick={() => handleClick(notification)}
                >
                  <div className="flex-1 space-y-1">
                    <p className="text-sm">{notification.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(notification.createdAt)}
                    </p>
                  </div>
                  {!notification.isRead && (
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
});
