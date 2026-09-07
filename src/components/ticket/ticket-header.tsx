"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, XCircle, ArrowRightLeft } from "lucide-react";
import { Ticket, STATUS_MAP } from "@/types/ticket";
import { buttons } from "@/lib/strings";
import React from "react";

interface TicketHeaderProps {
  ticket: Ticket;
  isAdmin: boolean;
  onOpenTransfer: () => void;
  onOpenClose: () => void;
}

export const TicketHeader = React.memo(function TicketHeader({
  ticket,
  isAdmin,
  onOpenTransfer,
  onOpenClose,
}: TicketHeaderProps) {
  const backHref = isAdmin ? "/admin/tickets" : "/user/tickets";

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Link href={backHref}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{ticket.subject}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">{ticket.ticketId}</span>
            <span>•</span>
            <Badge variant={STATUS_MAP[ticket.status].variant}>
              {STATUS_MAP[ticket.status].label}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {ticket.status !== "CLOSED" && isAdmin && (
          <>
            <Button variant="outline" size="sm" onClick={onOpenTransfer}>
              <ArrowRightLeft className="ml-1 h-4 w-4" />
              {buttons.TRANSFER_TICKET}
            </Button>
            <Button variant="destructive" size="sm" onClick={onOpenClose}>
              <XCircle className="ml-1 h-4 w-4" />
              {buttons.CLOSE_TICKET}
            </Button>
          </>
        )}
      </div>
    </div>
  );
});
