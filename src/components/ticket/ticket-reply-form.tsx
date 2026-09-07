"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, MessageSquareText } from "lucide-react";
import { Attachment, PredefinedMessage, Reply } from "@/types/ticket";
import { FileUpload } from "@/components/shared/file-upload";
import { UseMutationResult } from "@tanstack/react-query";
import { labels, buttons, placeholders, misc } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";
import { useUser } from "@/contexts/user-context";

interface AddReplyData {
  ticketId: string;
  data: {
    senderType: "USER" | "ADMIN";
    senderName: string;
    message: string;
    attachments?: Attachment[];
  };
}

interface TicketReplyFormProps {
  ticketId: string;
  isAdmin: boolean;
  messages: PredefinedMessage[];
  addReplyMutation: UseMutationResult<Reply, Error, AddReplyData>;
}

export const TicketReplyForm = React.memo(function TicketReplyForm({
  ticketId,
  isAdmin,
  messages,
  addReplyMutation,
}: TicketReplyFormProps) {
  const [replyMessage, setReplyMessage] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<Attachment[]>([]);
  const [showShortcodes, setShowShortcodes] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedShortcode, setSelectedShortcode] = useState("");
  const { user } = useUser();

  const handleReply = useCallback(() => {
    if (!replyMessage.trim()) return;

    let senderName: string = labels.REPLY_SUPPORT;
    let senderType: "USER" | "ADMIN" = "ADMIN";

    if (!isAdmin) {
      senderName = user ? `${user.firstName} ${user.lastName}` : labels.REPLY_USER;
      senderType = "USER";
    }

    addReplyMutation.mutate(
      {
        ticketId,
        data: {
          senderType,
          senderName,
          message: replyMessage.trim(),
          attachments: replyAttachments.length > 0 ? replyAttachments : undefined,
        },
      },
      {
        onSuccess: () => {
          setReplyMessage("");
          setReplyAttachments([]);
        },
      }
    );
  }, [replyMessage, isAdmin, ticketId, replyAttachments, addReplyMutation, user]);

  const handleInsertShortcode = useCallback((content: string) => {
    setReplyMessage((prev) => prev + content);
    setShowShortcodes(false);
  }, []);

  const categories = useMemo(() => Array.from(
    new Set(messages.map((msg) => msg.subDepartment?.name || "عمومی"))
  ), [messages]);

  const filteredMessages = useMemo(() => messages.filter(
    (msg) => (msg.subDepartment?.name || "عمومی") === selectedCategory
  ), [messages, selectedCategory]);

  const handleToggleShortcodes = useCallback(() => {
    setShowShortcodes(!showShortcodes);
    setSelectedCategory("");
    setSelectedShortcode("");
  }, [showShortcodes]);

  const handleCategoryChange = useCallback((value: string) => {
    setSelectedCategory(value);
    setSelectedShortcode("");
  }, []);

  const handleShortcodeChange = useCallback((value: string) => {
    setSelectedShortcode(value);
    const msg = messages.find((m) => m.shortCode === value);
    if (msg) {
      handleInsertShortcode(msg.content);
      setShowShortcodes(false);
      setSelectedCategory("");
      setSelectedShortcode("");
    }
  }, [messages, handleInsertShortcode]);

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (e.target.value.length <= 1000) {
      setReplyMessage(e.target.value);
    }
  }, []);

  const handleUpload = useCallback((file: { fileName: string; fileSize: number; fileType: string; fileUrl: string }) => {
    setReplyAttachments((prev) => [...prev, file as Attachment]);
  }, []);

  const handleRemove = useCallback((fileUrl: string) => {
    setReplyAttachments((prev) => prev.filter((f) => f.fileUrl !== fileUrl));
  }, []);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle className="text-base">{labels.TICKET_REPLY_FORM}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        <div className="space-y-4 flex-1 flex flex-col">
          <div className="space-y-2 flex-1 flex flex-col">
            <div className="flex items-center justify-between">
              <Label>{labels.TICKET_YOUR_REPLY}</Label>
              {isAdmin && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleShortcodes}
                >
                  <MessageSquareText className="ml-1 h-4 w-4" />
                  {labels.TICKET_READY_MESSAGES}
                </Button>
              )}
            </div>

            {isAdmin && showShortcodes && messages.length > 0 && (
              <div className="rounded-lg border p-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  {labels.SELECT_FIRST_CATEGORY}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{labels.TICKET_CATEGORY}</Label>
                    <Select
                      value={selectedCategory}
                      onValueChange={handleCategoryChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={labels.SELECT_CATEGORY} />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">{labels.TICKET_MESSAGE}</Label>
                    <Select
                      value={selectedShortcode}
                      onValueChange={handleShortcodeChange}
                      disabled={!selectedCategory}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            selectedCategory
                              ? labels.SELECT_MESSAGE
                              : labels.SELECT_FIRST_CATEGORY
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredMessages.map((msg) => (
                          <SelectItem key={msg.shortCode} value={msg.shortCode}>
                            <span className="font-mono text-xs ml-1">
                              {msg.shortCode}
                            </span>
                            {msg.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            <Textarea
              placeholder={placeholders.TICKET_REPLY}
              className="flex-1 min-h-50"
              value={replyMessage}
              onChange={handleTextareaChange}
              maxLength={1000}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{toPersianDigits(replyMessage.length)} / ۱۰۰۰</span>
            </div>
          </div>

          <FileUpload
            onUpload={handleUpload}
            onRemove={handleRemove}
            files={replyAttachments}
          />

          <div className="flex justify-end">
            <Button
              onClick={handleReply}
              disabled={addReplyMutation.isPending || !replyMessage.trim()}
            >
              {addReplyMutation.isPending ? (
                <>
                  <div className="ml-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {misc.LOADING}
                </>
              ) : (
                <>
                  <Send className="ml-2 h-4 w-4" />
                  {buttons.REPLY}
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
