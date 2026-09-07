"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  Ticket,
  Clock,
  CheckCircle2,
  AlertCircle,
  Bell,
  MessageSquare,
  ThumbsUp,
} from "lucide-react";
import { labels, titles } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";
import { useTickets, useUsers, useNotifications } from "@/hooks";

export default function AdminPage() {
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const { data: ticketsData, isLoading: ticketsLoading } = useTickets({ limit: 1000 });
  const { data: notifications } = useNotifications();

  const isLoading = usersLoading || ticketsLoading;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const tickets = ticketsData?.tickets || [];

  const stats = {
    totalUsers: users.length,
    totalTickets: tickets.length,
    openTickets: tickets.filter((t) => t.status === "OPEN").length,
    inProgressTickets: tickets.filter((t) => t.status === "IN_PROGRESS").length,
    closedTickets: tickets.filter((t) => t.status === "CLOSED").length,
    unreadNotifications: notifications?.unreadCount || 0,
    totalReplies: tickets.reduce(
      (acc, t) => acc + (t._count?.replies || 0),
      0,
    ),
    ratedTickets: tickets.filter((t) => t.rating !== null).length,
  };

  const statCards = [
    {
      title: labels.STATS_TOTAL_USERS,
      value: stats.totalUsers,
      icon: Users,
      color: "text-blue-800",
      bg: "bg-blue-800 dark:bg-blue-800",
      border: "border-blue-200 dark:border-blue-800",
      href: "/admin/users",
    },
    {
      title: labels.STATS_OPEN_TICKETS,
      value: stats.openTickets,
      icon: AlertCircle,
      color: "text-teal-600",
      bg: "bg-teal-600 dark:bg-teal-600",
      border: "border-teal-200 dark:border-teal-800",
      href: "/admin/tickets?status=OPEN",
    },
    {
      title: labels.STATS_IN_PROGRESS,
      value: stats.inProgressTickets,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-600 dark:bg-amber-600",
      border: "border-amber-200 dark:border-amber-800",
      href: "/admin/tickets?status=IN_PROGRESS",
    },
    {
      title: labels.STATS_CLOSED_TICKETS,
      value: stats.closedTickets,
      icon: CheckCircle2,
      color: "text-slate-600",
      bg: "bg-slate-600 dark:bg-slate-600",
      border: "border-slate-200 dark:border-slate-800",
      href: "/admin/tickets?status=CLOSED",
    },
    {
      title: labels.STATS_TOTAL_TICKETS,
      value: stats.totalTickets,
      icon: Ticket,
      color: "text-indigo-900",
      bg: "bg-indigo-900 dark:bg-indigo-900",
      border: "border-indigo-200 dark:border-indigo-800",
      href: "/admin/tickets",
    },
    {
      title: labels.STATS_NOTIFICATIONS,
      value: stats.unreadNotifications,
      icon: Bell,
      color: "text-rose-800",
      bg: "bg-rose-800 dark:bg-rose-800",
      border: "border-rose-200 dark:border-rose-800",
      href: "/admin/notifications",
    },
    {
      title: labels.STATS_TOTAL_REPLIES,
      value: stats.totalReplies,
      icon: MessageSquare,
      color: "text-cyan-800",
      bg: "bg-cyan-800 dark:bg-cyan-800",
      border: "border-cyan-200 dark:border-cyan-800",
      href: "/admin/tickets",
    },
    {
      title: labels.STATS_RATED_TICKETS,
      value: stats.ratedTickets,
      icon: ThumbsUp,
      color: "text-sky-900",
      bg: "bg-sky-900 dark:bg-sky-900",
      border: "border-sky-200 dark:border-sky-800",
      href: "/admin/tickets",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{titles.ADMIN_DASHBOARD}</h1>
        <p className="text-muted-foreground">نمای کلی سیستم پشتیبانی</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.title} href={card.href} className="cursor-pointer">
              <Card
                className={`transition-all hover:shadow-md hover:scale-[1.02] ${card.border}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {card.title}
                      </p>
                      <p className={`text-2xl font-bold ${card.color}`}>
                        {toPersianDigits(card.value)}
                      </p>
                    </div>
                    <div className={`rounded-full p-3 ${card.bg}`}>
                      <Icon className={`h-6 w-6 text-white ${card.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <p>برای مشاهده جزئیات از منوی سمت راست استفاده کنید</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
