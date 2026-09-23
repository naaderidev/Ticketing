"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock, Plus, ThumbsUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useUser } from "@/contexts/user-context";
import { useTickets } from "@/hooks";
import { toPersianDigits } from "@/lib/format";
import { buttons, descriptions, labels } from "@/lib/strings";

export function LegacyUserDashboard() {
  const { user } = useUser();
  const { data: ticketsData, isLoading: ticketsLoading } = useTickets(
    user ? { userId: user.id.toString(), limit: 1000 } : { limit: 0 }
  );
  const tickets = ticketsData?.tickets ?? [];

  if (ticketsLoading || !user) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const statCards = [
    { title: labels.STATS_OPEN_TICKETS, value: tickets.filter((ticket) => ticket.status === "OPEN").length, icon: AlertCircle, color: "text-teal-600", background: "bg-teal-600", border: "border-teal-200 dark:border-teal-800" },
    { title: labels.STATS_IN_PROGRESS, value: tickets.filter((ticket) => ticket.status === "IN_PROGRESS").length, icon: Clock, color: "text-amber-600", background: "bg-amber-600", border: "border-amber-200 dark:border-amber-800" },
    { title: labels.STATS_CLOSED_TICKETS, value: tickets.filter((ticket) => ticket.status === "CLOSED").length, icon: CheckCircle2, color: "text-slate-600", background: "bg-slate-600", border: "border-slate-200 dark:border-slate-800" },
    { title: labels.STATS_RATED_TICKETS, value: tickets.filter((ticket) => ticket.rating !== null).length, icon: ThumbsUp, color: "text-sky-900", background: "bg-sky-900", border: "border-sky-200 dark:border-sky-800" },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{descriptions.USER_WELCOME} {user.firstName} {user.lastName}</h1>
        <p className="text-muted-foreground">وضعیت تیکت‌های شما</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.title} href="/user/tickets">
              <Card className={`transition-all hover:scale-[1.02] hover:shadow-md ${card.border}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{card.title}</p>
                      <p className={`text-2xl font-bold ${card.color}`}>{toPersianDigits(card.value)}</p>
                    </div>
                    <div className={`rounded-full p-3 ${card.background}`}><Icon className="h-6 w-6 text-white" /></div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      <Link href="/user/tickets/new">
        <Card className="cursor-pointer border-sky-200 transition-all hover:scale-[1.02] hover:shadow-md dark:border-sky-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-center gap-3">
              <div className="rounded-xl bg-sky-50 p-3"><Plus className="h-6 w-6 text-sky-800" /></div>
              <div>
                <p className="font-medium text-sky-800">{buttons.WIZARD_NEW_TICKET_BTN}</p>
                <p className="text-sm text-muted-foreground">برای پشتیبانی تیکت جدید ثبت کنید</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
