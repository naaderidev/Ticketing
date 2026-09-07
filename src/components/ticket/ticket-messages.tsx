"use client";

import React, { useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User } from "lucide-react";
import { Ticket } from "@/types/ticket";
import { AttachmentList } from "@/components/shared/attachment-list";
import { ReplyItem } from "@/components/shared/reply-item";
import { formatDate } from "@/lib/format";
import { labels } from "@/lib/strings";

interface TicketMessagesProps {
  ticket: Ticket;
  mode: "user" | "admin";
}

export const TicketMessages = React.memo(function TicketMessages({
  ticket,
  mode,
}: TicketMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [ticket.replies]);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle className="text-base">
          {labels.TICKET_CONVERSATIONS}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 flex flex-col min-h-0">
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="space-y-4 p-4">
            {/* Initial Message */}
            <div className="flex flex-row gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary">
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <div className="flex flex-row items-center gap-2">
                  <span className="font-medium text-sm">{ticket.userName}</span>
                  <Badge variant="secondary">
                    {mode === "user" ? labels.REPLY_YOU : labels.REPLY_USER}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(ticket.createdAt)}
                  </span>
                </div>
                <div className="rounded-lg bg-muted p-3 text-right">
                  <p className="text-sm whitespace-pre-wrap">
                    {ticket.message}
                  </p>
                </div>
                <AttachmentList attachments={ticket.attachments} />
              </div>
            </div>

            {/* Replies */}
            {ticket.replies.map((reply) => (
              <ReplyItem key={reply.id} reply={reply} mode={mode} />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
});
