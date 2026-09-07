"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Clock, CheckCircle2, AlertCircle, ThumbsUp } from "lucide-react";
import { labels, descriptions, buttons } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";
import { useTickets, useNotifications } from "@/hooks";
import { useUser } from "@/contexts/user-context";

export default function UserPage() {
  const { user } = useUser();

  const { data: ticketsData, isLoading: ticketsLoading } = useTickets(
    user ? { userId: user.id.toString(), limit: 1000 } : { limit: 0 }
  );
  const { data: notifications } = useNotifications(user?.id);

  const tickets = ticketsData?.tickets || [];
  const isLoading = ticketsLoading || !user;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const stats = {
    openTickets: tickets.filter((t) => t.status === "OPEN").length,
    inProgressTickets: tickets.filter((t) => t.status === "IN_PROGRESS").length,
    closedTickets: tickets.filter((t) => t.status === "CLOSED").length,
    ratedTickets: tickets.filter((t) => t.rating !== null).length,
    unreadNotifications: notifications?.unreadCount || 0,
  };

  const statCards = [
    {
      title: labels.STATS_OPEN_TICKETS,
      value: stats.openTickets,
      icon: AlertCircle,
      color: "text-teal-600",
      bg: "bg-teal-600 dark:bg-teal-600",
      border: "border-teal-200 dark:border-teal-800",
      href: "/user/tickets",
    },
    {
      title: labels.STATS_IN_PROGRESS,
      value: stats.inProgressTickets,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-600 dark:bg-amber-600",
      border: "border-amber-200 dark:border-amber-800",
      href: "/user/tickets",
    },
    {
      title: labels.STATS_CLOSED_TICKETS,
      value: stats.closedTickets,
      icon: CheckCircle2,
      color: "text-slate-600",
      bg: "bg-slate-600 dark:bg-slate-600",
      border: "border-slate-200 dark:border-slate-800",
      href: "/user/tickets",
    },
    {
      title: labels.STATS_RATED_TICKETS,
      value: stats.ratedTickets,
      icon: ThumbsUp,
      color: "text-sky-900",
      bg: "bg-sky-900 dark:bg-sky-900",
      border: "border-sky-200 dark:border-sky-800",
      href: "/user/tickets",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {descriptions.USER_WELCOME} {user?.firstName} {user?.lastName}
        </h1>
        <p className="text-muted-foreground">وضعیت تیکت‌های شما</p>
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

      <Link href="/user/tickets/new" className="cursor-pointer">
        <Card className="transition-all hover:shadow-md hover:scale-[1.02] border-sky-200 dark:border-sky-800 cursor-pointer">
          <CardContent className="p-6">
            <div className="flex items-center justify-center gap-3">
              <div className="rounded-xl bg-sky-50 p-3">
                <Plus className="h-6 w-6 text-sky-800" />
              </div>
              <div>
                <p className="font-medium text-sky-800">{buttons.WIZARD_NEW_TICKET_BTN}</p>
                <p className="text-sm text-muted-foreground">
                  برای پشتیبانی تیکت جدید ثبت کنید
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
