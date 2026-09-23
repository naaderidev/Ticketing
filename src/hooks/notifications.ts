"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { NotificationItem } from "@/types/shared";

export function useNotifications(userId?: number) {
  return useQuery<{ notifications: NotificationItem[]; unreadCount: number }>({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("دریافت نوتیفیکیشن‌ها ناموفق بود");
      return res.json();
    },
    refetchInterval: 30000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/notifications/${id}`, { method: "PUT" });
      if (!res.ok) throw new Error("Failed to mark notification as read");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId?: number) => {
      void userId;
      const res = await fetch("/api/notifications/read-all", { method: "PUT" });
      if (!res.ok) throw new Error("Failed to mark all notifications as read");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
