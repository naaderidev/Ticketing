"use client";

import { Card, CardContent } from "@/components/ui/card";
import { User, FileText } from "lucide-react";
import { StarRating } from "@/components/shared/star-rating";
import { Ticket } from "@/types/ticket";
import { labels } from "@/lib/strings";
import React from "react";

interface TicketInfoProps {
  ticket: Ticket;
  isAdmin: boolean;
}

export const TicketInfo = React.memo(function TicketInfo({ ticket, isAdmin }: TicketInfoProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>{ticket.userName}</span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span>
              {ticket.department.name} / {ticket.subDepartment?.name}
            </span>
          </div>
          {ticket.rating && (
            <div className="flex items-center gap-2">
              <StarRating rating={ticket.rating} size="sm" />
              {isAdmin && (
                <span className="text-muted-foreground">
                  {ticket.rating?.toLocaleString("fa-IR")} {labels.RATING_OUT_OF.replace("{rating}", "")}
                </span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
