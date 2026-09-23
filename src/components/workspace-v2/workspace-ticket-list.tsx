"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Inbox } from "lucide-react";
import { useWorkspaceQueues, useWorkspaceTickets } from "@/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import type { WorkspaceSlaStatus, WorkspaceTicketPriority, WorkspaceTicketStatus } from "@/types/workspace-ticket-v2";
import { WORKSPACE_PRIORITY_LABELS, WORKSPACE_STATUS_LABELS } from "./workspace-labels";
import { SlaCountdown } from "./sla-countdown";

const statuses: WorkspaceTicketStatus[] = ["NEW", "UNASSIGNED", "IN_PROGRESS", "INTERNAL_REFERRAL", "WAITING_INTERNAL", "WAITING_USER", "RESOLVED", "CLOSED", "REOPENED", "CLOSED_LEGACY"];
const priorities: WorkspaceTicketPriority[] = ["CRITICAL", "HIGH", "NORMAL", "LOW"];

export function WorkspaceTicketList({ initialQueueId, initialSlaStatus, initialStatus, initialPriority, initialOwnership }: { initialQueueId?: number; initialSlaStatus?: WorkspaceSlaStatus; initialStatus?: WorkspaceTicketStatus; initialPriority?: WorkspaceTicketPriority; initialOwnership?: "ALL" | "MINE" | "UNASSIGNED" }) {
  const [queueId, setQueueId] = useState<number | undefined>(initialQueueId);
  const [status, setStatus] = useState<WorkspaceTicketStatus | undefined>(initialStatus);
  const [priority, setPriority] = useState<WorkspaceTicketPriority | undefined>(initialPriority);
  const [slaStatus, setSlaStatus] = useState<WorkspaceSlaStatus | undefined>(initialSlaStatus);
  const [ownership, setOwnership] = useState<"ALL" | "MINE" | "UNASSIGNED">(initialOwnership ?? "ALL");
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const queues = useWorkspaceQueues();
  const tickets = useWorkspaceTickets({ queueId, status, priority, slaStatus, ownership, cursor: cursors.at(-1), limit: 20 });
  useEffect(() => setCursors([null]), [queueId, status, priority, slaStatus, ownership]);
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">صف درخواست‌ها</h1><p className="text-muted-foreground">نمایش فقط تیم‌ها و عملیات مجاز شما</p></div>
    <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
      <Select value={queueId ? String(queueId) : "ALL"} onValueChange={(value) => setQueueId(value === "ALL" ? undefined : Number(value))}><SelectTrigger aria-label="صف"><SelectValue placeholder="همه صف‌ها"/></SelectTrigger><SelectContent><SelectItem value="ALL">همه صف‌ها</SelectItem>{queues.data?.map((queue) => <SelectItem key={queue.id} value={String(queue.id)}>{queue.team.name} / {queue.name}</SelectItem>)}</SelectContent></Select>
      <Select value={status ?? "ALL"} onValueChange={(value) => setStatus(value === "ALL" ? undefined : value as WorkspaceTicketStatus)}><SelectTrigger aria-label="وضعیت"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ALL">همه وضعیت‌ها</SelectItem>{statuses.map((value) => <SelectItem key={value} value={value}>{WORKSPACE_STATUS_LABELS[value]}</SelectItem>)}</SelectContent></Select>
      <Select value={priority ?? "ALL"} onValueChange={(value) => setPriority(value === "ALL" ? undefined : value as WorkspaceTicketPriority)}><SelectTrigger aria-label="اولویت"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ALL">همه اولویت‌ها</SelectItem>{priorities.map((value) => <SelectItem key={value} value={value}>{WORKSPACE_PRIORITY_LABELS[value]}</SelectItem>)}</SelectContent></Select>
      <Select value={slaStatus ?? "ALL"} onValueChange={(value) => setSlaStatus(value === "ALL" ? undefined : value as WorkspaceSlaStatus)}><SelectTrigger aria-label="وضعیت SLA"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ALL">همه وضعیت‌های SLA</SelectItem><SelectItem value="AT_RISK">نزدیک نقض</SelectItem><SelectItem value="BREACHED">نقض‌شده</SelectItem><SelectItem value="PAUSED">متوقف</SelectItem></SelectContent></Select>
      <Select value={ownership} onValueChange={(value) => setOwnership(value as typeof ownership)}><SelectTrigger aria-label="مالکیت"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ALL">همه مالکیت‌ها</SelectItem><SelectItem value="MINE">درخواست‌های من</SelectItem><SelectItem value="UNASSIGNED">بدون مالک</SelectItem></SelectContent></Select>
    </div>
    {tickets.isLoading && <p role="status" className="py-12 text-center text-muted-foreground">در حال دریافت…</p>}
    {tickets.error && <div role="alert" className="rounded-lg bg-destructive/10 p-4 text-destructive"><p>{tickets.error.message}</p><Button variant="outline" className="mt-3" onClick={() => void tickets.refetch()}>تلاش دوباره</Button></div>}
    {tickets.data?.data.length === 0 && <Card><CardContent className="flex flex-col items-center py-14"><Inbox className="mb-3 h-10 w-10 text-muted-foreground"/><p>درخواستی مطابق فیلترها وجود ندارد.</p></CardContent></Card>}
    <div className="grid gap-3">{tickets.data?.data.map((ticket) => { const breached = ticket.sla?.firstResponse.state === "BREACHED" || ticket.sla?.resolution.state === "BREACHED"; const atRisk = (ticket.sla?.firstResponse.state === "PENDING" && ticket.sla.firstResponse.warningLevel !== "NONE") || (ticket.sla?.resolution.state === "PENDING" && ticket.sla.resolution.warningLevel !== "NONE"); return <Link key={ticket.ticketId} href={`/admin/tickets/${ticket.ticketId}`}><Card className="transition-colors hover:border-primary/50"><CardContent className="p-5"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="flex flex-wrap gap-2"><Badge>{WORKSPACE_STATUS_LABELS[ticket.status]}</Badge><Badge variant="outline">{WORKSPACE_PRIORITY_LABELS[ticket.priority]}</Badge>{breached && <Badge variant="destructive">نقض SLA</Badge>}{!breached && atRisk && <Badge className="bg-amber-600">نزدیک نقض</Badge>}{ticket.sla?.resolution.paused && <Badge variant="secondary">زمان‌سنج متوقف</Badge>}</div><p className="mt-2 truncate font-semibold">{ticket.subject}</p><p className="text-xs text-muted-foreground">{ticket.ticketId} · {ticket.requestType?.service.name} / {ticket.requestType?.name}</p>{ticket.sla && <SlaCountdown dueAt={ticket.sla.resolution.dueAt} state={ticket.sla.resolution.state} paused={ticket.sla.resolution.paused} className="mt-1 block text-xs text-muted-foreground"/>}</div><div className="shrink-0 text-sm"><p>{ticket.queue?.name ?? "بدون صف"}</p><p className="text-muted-foreground">{ticket.owner?.name ?? "بدون مالک"}</p><p className="text-xs text-muted-foreground">{formatDate(ticket.updatedAt)}</p></div></div></CardContent></Card></Link>; })}</div>
    {tickets.data && <div className="flex justify-between"><Button variant="outline" disabled={cursors.length === 1} onClick={() => setCursors((current) => current.slice(0, -1))}><ArrowRight className="ml-2 h-4 w-4"/>قبلی</Button><Button variant="outline" disabled={!tickets.data.page.nextCursor} onClick={() => tickets.data?.page.nextCursor && setCursors((current) => [...current, tickets.data!.page.nextCursor])}>بعدی<ArrowLeft className="mr-2 h-4 w-4"/></Button></div>}
  </div>;
}
