"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Inbox, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomerTicketsV2, usePartyContexts } from "@/hooks";
import { formatDate, toPersianDigits } from "@/lib/format";
import type {
  CustomerTicketPriority,
  CustomerTicketStatus,
} from "@/types/customer-ticket-v2";

const STATUS_LABELS: Record<CustomerTicketStatus, string> = {
  IN_PROGRESS: "در حال بررسی",
  WAITING_USER: "منتظر پاسخ شما",
  RESOLVED: "حل شده",
  CLOSED: "بسته شده",
};

const STATUS_VARIANTS: Record<
  CustomerTicketStatus,
  "open" | "in-progress" | "closed" | "secondary"
> = {
  IN_PROGRESS: "in-progress",
  WAITING_USER: "open",
  RESOLVED: "secondary",
  CLOSED: "closed",
};

const PRIORITY_LABELS: Record<CustomerTicketPriority, string> = {
  CRITICAL: "بحرانی",
  HIGH: "بالا",
  NORMAL: "عادی",
  LOW: "کم",
};

export function CustomerTicketList() {
  const [status, setStatus] = useState<CustomerTicketStatus | "ALL">("ALL");
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([null]);
  const cursor = cursorHistory.at(-1) ?? null;
  const contexts = usePartyContexts();
  const activePartyId = contexts.data?.activePartyId;
  const query = useCustomerTicketsV2(
    {
      status: status === "ALL" ? undefined : status,
      cursor,
      limit: 15,
    },
    activePartyId
  );

  useEffect(() => {
    setCursorHistory([null]);
  }, [activePartyId, status]);

  function nextPage() {
    if (!query.data?.page.nextCursor) return;
    setCursorHistory((current) => [...current, query.data!.page.nextCursor]);
  }

  function previousPage() {
    setCursorHistory((current) =>
      current.length > 1 ? current.slice(0, -1) : current
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">درخواست‌های من</h1>
          <p className="text-sm text-muted-foreground">
            پیگیری درخواست‌ها در Context فعال شما
          </p>
        </div>
        <Link href="/user/tickets/new">
          <Button>
            <Plus className="ml-2 h-4 w-4" /> درخواست جدید
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <label htmlFor="customer-ticket-status" className="text-sm font-medium">
          وضعیت
        </label>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as CustomerTicketStatus | "ALL")}
        >
          <SelectTrigger id="customer-ticket-status" className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">همه وضعیت‌ها</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(contexts.isLoading || query.isLoading) && (
        <p className="py-12 text-center text-muted-foreground" role="status">
          در حال دریافت درخواست‌ها…
        </p>
      )}
      {(contexts.error || query.error) && (
        <div className="rounded-lg border border-destructive/40 p-4 text-destructive" role="alert">
          <p>{contexts.error?.message ?? query.error?.message}</p>
          <Button className="mt-3" variant="outline" onClick={() => void Promise.all([contexts.refetch(), query.refetch()])}>
            تلاش دوباره
          </Button>
        </div>
      )}
      {query.data?.data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <Inbox className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium">درخواستی در این وضعیت ندارید.</p>
            <Link href="/user/tickets/new" className="mt-4">
              <Button variant="outline">ثبت اولین درخواست</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {query.data?.data.map((ticket) => (
          <Link key={ticket.ticketId} href={`/user/tickets/${ticket.ticketId}`}>
            <Card className="transition-colors hover:border-primary/50 hover:bg-muted/20">
              <CardContent className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={STATUS_VARIANTS[ticket.status]}>
                        {STATUS_LABELS[ticket.status]}
                      </Badge>
                      <Badge variant="outline">
                        {PRIORITY_LABELS[ticket.priority]}
                      </Badge>
                    </div>
                    <h2 className="mt-3 truncate font-semibold">{ticket.subject}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {ticket.requestType.service.name} / {ticket.requestType.name}
                    </p>
                  </div>
                  <div className="shrink-0 text-left text-xs text-muted-foreground">
                    <p className="font-mono">{ticket.ticketId}</p>
                    <p className="mt-1">آخرین تغییر: {formatDate(ticket.updatedAt)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {query.data && (cursorHistory.length > 1 || query.data.page.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            disabled={cursorHistory.length === 1 || query.isFetching}
            onClick={previousPage}
          >
            <ArrowRight className="ml-2 h-4 w-4" /> صفحه قبل
          </Button>
          <span className="text-sm text-muted-foreground">
            صفحه {toPersianDigits(cursorHistory.length)}
          </span>
          <Button
            variant="outline"
            disabled={!query.data.page.hasMore || query.isFetching}
            onClick={nextPage}
          >
            صفحه بعد <ArrowLeft className="mr-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
