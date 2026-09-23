"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, Clock3, Inbox, PauseCircle, RotateCcw, UserRoundX, Users, Zap } from "lucide-react";
import { useWorkspaceQueues, useWorkspaceSlaSummary, useWorkspaceTickets } from "@/hooks";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, toPersianDigits } from "@/lib/format";
import { WORKSPACE_STATUS_LABELS } from "./workspace-labels";

export function WorkspaceDashboard() {
  const queues = useWorkspaceQueues();
  const recent = useWorkspaceTickets({ limit: 8, ownership: "ALL" });
  const slaSummary = useWorkspaceSlaSummary();
  const workboxes = [
    { label: "جدید", count: slaSummary.data?.new ?? 0, href: "/admin/tickets?status=NEW", icon: Inbox },
    { label: "فوری", count: slaSummary.data?.urgent ?? 0, href: "/admin/tickets?priority=CRITICAL", icon: Zap },
    { label: "نزدیک به تأخیر", count: slaSummary.data?.atRisk ?? 0, href: "/admin/tickets?slaStatus=AT_RISK", icon: Clock3 },
    { label: "منتظر پاسخ کاربر", count: slaSummary.data?.waitingUser ?? 0, href: "/admin/tickets?status=WAITING_USER", icon: PauseCircle },
    { label: "منتظر واحد داخلی", count: slaSummary.data?.waitingInternal ?? 0, href: "/admin/tickets?status=WAITING_INTERNAL", icon: Users },
    { label: "بدون مسئول", count: slaSummary.data?.unassigned ?? 0, href: "/admin/tickets?ownership=UNASSIGNED", icon: UserRoundX },
    { label: "بازشده مجدد", count: slaSummary.data?.reopened ?? 0, href: "/admin/tickets?status=REOPENED", icon: RotateCcw },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">فضای کاری پشتیبانی</h1>
        <p className="text-muted-foreground">
          صف‌ها، مالکیت و SLA درخواست‌ها در یک نمای عملیاتی
        </p>
      </div>
      {(queues.error || recent.error || slaSummary.error) && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 p-4 text-destructive"
        >
          {queues.error?.message ?? recent.error?.message ?? slaSummary.error?.message}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm text-muted-foreground">
                درخواست فعال در صف‌ها
              </p>
              <p className="text-2xl font-bold">
                {toPersianDigits(
                  queues.data?.reduce(
                    (sum, queue) => sum + queue.ticketCount,
                    0,
                  ) ?? 0,
                )}
              </p>
            </div>
            <Inbox className="h-7 w-7 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm text-muted-foreground">صف قابل دسترس</p>
              <p className="text-2xl font-bold">
                {toPersianDigits(queues.data?.length ?? 0)}
              </p>
            </div>
            <Users className="h-7 w-7 text-sky-700" />
          </CardContent>
        </Card>
        <Link href="/admin/tickets?slaStatus=AT_RISK">
        <Card className={slaSummary.data?.atRisk ? "border-amber-500/50" : undefined}>
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm text-muted-foreground">نزدیک نقض SLA</p>
              <p className="text-2xl font-bold">{toPersianDigits(slaSummary.data?.atRisk ?? 0)}</p>
            </div>
            <Clock3 className="h-7 w-7 text-amber-600" />
          </CardContent>
        </Card>
        </Link>
        <Link href="/admin/tickets?slaStatus=BREACHED">
        <Card className={slaSummary.data?.breached ? "border-destructive/50" : undefined}>
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div><p className="text-sm text-muted-foreground">SLA نقض‌شده</p><p className="text-2xl font-bold">{toPersianDigits(slaSummary.data?.breached ?? 0)}</p></div>
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </CardContent>
        </Card>
        </Link>
        <Link href="/admin/tickets?slaStatus=PAUSED">
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div><p className="text-sm text-muted-foreground">منتظر مشتری</p><p className="text-2xl font-bold">{toPersianDigits(slaSummary.data?.paused ?? 0)}</p></div>
            <PauseCircle className="h-7 w-7 text-sky-700" />
          </CardContent>
        </Card>
        </Link>
      </div>
      <section className="space-y-3" aria-labelledby="workboxes-title">
        <div>
          <h2 id="workboxes-title" className="text-lg font-semibold">صندوق‌های کاری کارشناس</h2>
          <p className="text-sm text-muted-foreground">ورود مستقیم به مهم‌ترین وضعیت‌های عملیاتی</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {workboxes.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.label} href={item.href}>
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardContent className="flex h-full items-center justify-between gap-3 p-4">
                    <div>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="mt-1 text-xl font-bold">{toPersianDigits(item.count)}</p>
                    </div>
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {queues.data?.map((queue) => (
          <Link key={queue.id} href={`/admin/tickets?queueId=${queue.id}`}>
            <Card className="transition-colors hover:border-primary/50">
              <CardContent className="p-4">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-semibold">{queue.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {queue.team.name}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {toPersianDigits(queue.ticketCount)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">آخرین درخواست‌ها</CardTitle>
          <Link href="/admin/tickets" className="text-sm text-primary">
            مشاهده همه <ArrowLeft className="inline h-4 w-4" />
          </Link>
        </CardHeader>
        <CardContent className="divide-y">
          {recent.isLoading && <p role="status">در حال دریافت…</p>}
          {recent.data?.data.map((ticket) => (
            <Link
              key={ticket.ticketId}
              href={`/admin/tickets/${ticket.ticketId}`}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{ticket.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {ticket.queue?.name ?? "بدون صف"} ·{" "}
                  {ticket.owner?.name ?? "بدون مالک"}
                </p>
              </div>
              <div className="shrink-0 text-left">
                <Badge variant="outline">
                  {WORKSPACE_STATUS_LABELS[ticket.status]}
                </Badge>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(ticket.updatedAt)}
                </p>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
