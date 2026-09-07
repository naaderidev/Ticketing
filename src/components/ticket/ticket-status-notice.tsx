"use client";

import { Card, CardContent } from "@/components/ui/card";
import { XCircle, CheckCircle } from "lucide-react";
import { StarRating } from "@/components/shared/star-rating";
import { Ticket } from "@/types/ticket";
import { labels } from "@/lib/strings";
import { formatDate } from "@/lib/format";
import React from "react";

interface TicketStatusNoticeProps {
  ticket: Ticket;
}

export const TicketStatusNotice = React.memo(function TicketStatusNotice({ ticket }: TicketStatusNoticeProps) {
  if (ticket.status !== "CLOSED" && !ticket.rating) {
    return null;
  }

  return (
    <div
      className={`grid grid-cols-1 ${
        ticket.status === "CLOSED" && ticket.rating ? "sm:grid-cols-2" : ""
      } gap-4`}
    >
      {ticket.status === "CLOSED" && ticket.closedReason && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">
                  {labels.TICKET_CLOSED_STATUS}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {labels.CLOSE_REASON_LABEL.replace("{reason}", ticket.closedReason)}
                </p>
                {ticket.closedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {labels.CLOSE_DATE_LABEL.replace("{date}", formatDate(ticket.closedAt))}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {ticket.rating && (
        <Card className="border-amber-200 dark:border-emerald-600">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 dark:bg-emerald-600">
                <CheckCircle className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-emerald-600">
                  {labels.RATING_SAVED}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <StarRating rating={ticket.rating} size="lg" />
                  <span className="text-sm text-muted-foreground mr-2">
                    {ticket.rating?.toLocaleString("fa-IR")} {labels.RATING_OUT_OF.replace("{rating}", "")}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});
