import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, Headphones } from "lucide-react";
import { Reply } from "@/types/ticket";
import { AttachmentList } from "./attachment-list";
import { StarRating } from "./star-rating";
import { formatDate } from "@/lib/format";
import { labels } from "@/lib/strings";
import React from "react";

interface ReplyItemProps {
  reply: Reply;
  mode: "user" | "admin";
}

export const ReplyItem = React.memo(function ReplyItem({ reply, mode }: ReplyItemProps) {
  const isAdmin = reply.senderType === "ADMIN";

  return (
    <div className="flex flex-row gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback
          className={isAdmin
            ? "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300"
            : "bg-primary/10 text-primary"
          }
        >
          {isAdmin ? <Headphones className="h-4 w-4" /> : <User className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-1">
        <div className="flex flex-row items-center gap-2">
          <span className="text-sm font-medium">{reply.senderName}</span>
          <Badge variant={isAdmin ? "default" : "secondary"}>
            {isAdmin ? labels.REPLY_SUPPORT : mode === "user" ? labels.REPLY_YOU : labels.REPLY_USER}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatDate(reply.createdAt)}
          </span>
        </div>
        <div className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap text-right">
          {reply.message}
        </div>
        <AttachmentList attachments={reply.attachments} />
        {reply.rating && (
          <StarRating rating={reply.rating} size="md" />
        )}
      </div>
    </div>
  );
});
