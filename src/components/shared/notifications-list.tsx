"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bell, CheckCheck, Ticket, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { toPersianDigits, formatRelativeTime } from "@/lib/format"
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks"
import { toast } from "sonner"

export function NotificationsList() {
  const { data: notificationData, isLoading } = useNotifications();
  const markNotificationReadMutation = useMarkNotificationRead();
  const markAllNotificationsReadMutation = useMarkAllNotificationsRead();

  const notifications = notificationData?.notifications || [];
  const unreadCount = notificationData?.unreadCount || 0;

  const markAsRead = (id: number) => {
    markNotificationReadMutation.mutate(id, {
      onError: () => {
        toast.error("خطا در بروزرسانی نوتیفیکیشن");
      },
    });
  };

  const markAllAsRead = () => {
    markAllNotificationsReadMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success("همه نوتیفیکیشن‌ها خوانده شد");
      },
      onError: () => {
        toast.error("خطا در بروزرسانی نوتیفیکیشن");
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="cursor-pointer">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">نوتیفیکیشن‌ها</h1>
            <p className="text-muted-foreground">
              {unreadCount > 0 ? `${toPersianDigits(unreadCount)} نوتیفیکیشن خوانده نشده` : "همه خوانده شده"}
            </p>
          </div>
        </div>

        {unreadCount > 0 && (
          <Button
            variant="outline"
            onClick={markAllAsRead}
            disabled={markAllNotificationsReadMutation.isPending}
          >
            <CheckCheck className="ml-2 h-4 w-4" />
            {markAllNotificationsReadMutation.isPending ? "در حال بروزرسانی..." : "همه خوانده شد"}
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="mb-2 h-8 w-8 opacity-50" />
              <p>نوتیفیکیشنی وجود ندارد</p>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="divide-y">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      "flex items-start gap-4 p-4 transition-colors hover:bg-muted/50",
                      !notification.isRead && "bg-muted/30"
                    )}
                  >
                    <div className="mt-1">
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full",
                          notification.isRead
                            ? "bg-muted"
                            : "bg-primary/10"
                        )}
                      >
                        <Bell
                          className={cn(
                            "h-4 w-4",
                            notification.isRead
                              ? "text-muted-foreground"
                              : "text-primary"
                          )}
                        />
                      </div>
                    </div>

                    <div className="flex-1 space-y-1">
                      <p className={cn("text-sm", !notification.isRead && "font-medium")}>
                        {notification.message}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatRelativeTime(notification.createdAt)}</span>
                        <span>•</span>
                        <Link
                          href={`/admin/tickets/${notification.ticketId}`}
                          className="flex items-center gap-1 text-primary hover:underline cursor-pointer"
                          onClick={() => !notification.isRead && markAsRead(notification.id)}
                        >
                          <Ticket className="h-3 w-3" />
                          {notification.ticketId}
                        </Link>
                      </div>
                    </div>

                    {!notification.isRead && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markAsRead(notification.id)}
                      >
                        خوانده شد
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
