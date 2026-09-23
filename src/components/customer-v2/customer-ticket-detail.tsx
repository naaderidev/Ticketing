"use client";

import { useRef, useState, type MutableRefObject } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  MessageSquare,
  RotateCcw,
  Send,
  Star,
  XCircle,
} from "lucide-react";
import { AttachmentList } from "@/components/shared/attachment-list";
import { FileUpload } from "@/components/shared/file-upload";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CustomerApiError,
  useAddCustomerMessageV2,
  useCustomerTicketV2,
  useRateCustomerTicketV2,
  useTransitionCustomerTicketV2,
} from "@/hooks/customer-tickets-v2";
import { usePartyContexts } from "@/hooks/organization-contexts";
import { createClientIdempotencyKey } from "@/lib/client-idempotency-key";
import { formatDate, toPersianDigits } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PendingAttachment } from "@/types/ticket";
import type { CustomerTicketStatus } from "@/types/customer-ticket-v2";

const STATUS: Record<
  CustomerTicketStatus,
  { label: string; variant: "open" | "in-progress" | "closed" | "secondary" }
> = {
  IN_PROGRESS: { label: "در حال بررسی", variant: "in-progress" },
  WAITING_USER: { label: "منتظر پاسخ شما", variant: "open" },
  RESOLVED: { label: "حل شده", variant: "secondary" },
  CLOSED: { label: "بسته شده", variant: "closed" },
};

type Submission = { payload: string; key: string };

function stableKey(ref: MutableRefObject<Submission | null>, payload: unknown) {
  const serialized = JSON.stringify(payload);
  if (ref.current?.payload === serialized) return ref.current.key;
  const key = createClientIdempotencyKey();
  ref.current = { payload: serialized, key };
  return key;
}

function visibleMutationError(error: Error | null): string | null {
  if (!error) return null;
  if (error instanceof CustomerApiError && error.requestId) {
    return `${error.message} (شناسه پیگیری: ${error.requestId})`;
  }
  return error.message;
}

export function CustomerTicketDetail() {
  const params = useParams<{ ticketId: string }>();
  const ticketId = params.ticketId;
  const contexts = usePartyContexts();
  const activeContext = contexts.data?.contexts.find(
    (context) => context.partyId === contexts.data?.activePartyId
  );
  const activePartyId = activeContext?.partyId;
  const ticketQuery = useCustomerTicketV2(ticketId, activePartyId);
  const addMessage = useAddCustomerMessageV2(activePartyId);
  const transition = useTransitionCustomerTicketV2(activePartyId);
  const rate = useRateCustomerTicketV2(activePartyId);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [selectedRating, setSelectedRating] = useState(0);
  const messageSubmission = useRef<Submission | null>(null);
  const transitionSubmission = useRef<Submission | null>(null);
  const ratingSubmission = useRef<Submission | null>(null);

  const ticket = ticketQuery.data;
  const mutationError =
    visibleMutationError(addMessage.error) ??
    visibleMutationError(transition.error) ??
    visibleMutationError(rate.error);

  if (contexts.isLoading || ticketQuery.isLoading) {
    return <p className="py-12 text-center text-muted-foreground">در حال دریافت تیکت…</p>;
  }
  if (contexts.error) {
    return (
      <div className="space-y-4 rounded-lg border border-destructive/40 p-4 text-destructive" role="alert">
        <p>{contexts.error.message}</p>
        <Button variant="outline" onClick={() => void contexts.refetch()}>
          تلاش دوباره
        </Button>
      </div>
    );
  }
  if (!ticket || ticketQuery.error) {
    const unavailableInActiveContext =
      ticketQuery.error instanceof CustomerApiError &&
      ticketQuery.error.status === 404;
    return (
      <div className="space-y-4 rounded-xl border bg-card p-6" role="alert">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <h2 className="font-semibold">
              {unavailableInActiveContext
                ? "این درخواست در حساب فعال فعلی قابل مشاهده نیست"
                : "دریافت درخواست ناموفق بود"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {unavailableInActiveContext
                ? `حساب فعال: ${activeContext?.displayName ?? "حساب فعلی"}. برای مشاهده این درخواست، حساب مرتبط را از بالای صفحه انتخاب کنید.`
                : ticketQuery.error?.message ?? "تیکت یافت نشد."}
            </p>
          </div>
        </div>
        <Link href="/user/tickets">
          <Button variant="outline">مشاهده درخواست‌های حساب فعال</Button>
        </Link>
      </div>
    );
  }

  function sendMessage() {
    if (!ticket || !message.trim()) return;
    const payload = {
      ticketId: ticket.ticketId,
      message: message.trim(),
      attachments: attachments.map(({ uploadId }) => ({ uploadId })),
    };
    addMessage.mutate(
      {
        ...payload,
        version: ticket.version,
        idempotencyKey: stableKey(messageSubmission, payload),
      },
      {
        onSuccess: () => {
          messageSubmission.current = null;
          setMessage("");
          setAttachments([]);
        },
      }
    );
  }

  function runTransition(action: "confirm-resolution" | "reject-resolution" | "reopen") {
    if (!ticket) return;
    const needsReason = action !== "confirm-resolution";
    if (needsReason && !reason.trim()) return;
    const payload = {
      ticketId: ticket.ticketId,
      transition: action,
      reason: reason.trim(),
    };
    transition.mutate(
      {
        ...payload,
        version: ticket.version,
        idempotencyKey: stableKey(transitionSubmission, payload),
      },
      {
        onSuccess: () => {
          transitionSubmission.current = null;
          setReason("");
        },
      }
    );
  }

  function submitRating() {
    if (!ticket || selectedRating < 1) return;
    const payload = { ticketId: ticket.ticketId, rating: selectedRating };
    rate.mutate(
      {
        ...payload,
        version: ticket.version,
        idempotencyKey: stableKey(ratingSubmission, payload),
      },
      { onSuccess: () => (ratingSubmission.current = null) }
    );
  }

  const canReply = ["IN_PROGRESS", "WAITING_USER"].includes(ticket.status);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/user/tickets"
            className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="ml-1 h-4 w-4" /> بازگشت به درخواست‌ها
          </Link>
          <h1 className="text-2xl font-bold">{ticket.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={STATUS[ticket.status].variant}>
              {STATUS[ticket.status].label}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">
              {ticket.ticketId}
            </span>
          </div>
        </div>
        <div className="text-sm text-muted-foreground sm:text-left">
          <p>{ticket.requestType.service.name}</p>
          <p>{ticket.requestType.name}</p>
        </div>
      </div>

      {ticket.status === "WAITING_USER" && (
        <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>برای ادامه بررسی، پاسخ یا اطلاعات تکمیلی شما لازم است.</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="text-muted-foreground">ثبت درخواست</p>
            <p className="mt-1 font-medium">{formatDate(ticket.createdAt)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="text-muted-foreground">مهلت پاسخ اولیه</p>
            <p className="mt-1 flex items-center gap-1 font-medium">
              <Clock3 className="h-4 w-4" />
              {ticket.sla ? formatDate(ticket.sla.firstResponse.dueAt) : "نامشخص"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="text-muted-foreground">محدوده درخواست</p>
            <p className="mt-1 font-medium">
              {ticket.organization?.legalName ?? "حساب فردی"}
            </p>
          </CardContent>
        </Card>
      </div>

      {ticket.businessReferences.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">موضوع مرتبط</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {ticket.businessReferences.map((reference) => (
              <Badge
                key={`${reference.referenceType}:${reference.referenceKey}`}
                variant="outline"
              >
                {reference.displayLabel ?? reference.referenceKey}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-5 w-5" /> گفت‌وگو
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {ticket.messages.map((item) => {
            const customer = item.authorType === "CUSTOMER";
            return (
              <div
                key={item.id}
                className={cn("flex gap-3", customer ? "flex-row" : "flex-row-reverse")}
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback>{customer ? "ش" : "پ"}</AvatarFallback>
                </Avatar>
                <div className={cn("max-w-[85%]", !customer && "text-left")}>
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{customer ? "شما" : item.authorLabel}</span>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                  <div
                    className={cn(
                      "rounded-xl p-3 text-sm whitespace-pre-wrap",
                      customer ? "bg-primary/10" : "bg-muted"
                    )}
                  >
                    {item.body}
                  </div>
                  <div className="mt-2">
                    <AttachmentList attachments={item.attachments} />
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {canReply && (
        <Card>
          <CardHeader><CardTitle className="text-base">ارسال پاسخ</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={5000}
              rows={5}
              placeholder="پاسخ یا اطلاعات تکمیلی را بنویسید"
            />
            <FileUpload
              files={attachments}
              disabled={addMessage.isPending}
              onUpload={(file) => setAttachments((current) => [...current, file])}
              onRemove={(uploadId) =>
                setAttachments((current) =>
                  current.filter((file) => file.uploadId !== uploadId)
                )
              }
            />
            <div className="flex justify-end">
              <Button disabled={!message.trim() || addMessage.isPending} onClick={sendMessage}>
                <Send className="ml-2 h-4 w-4" />
                {addMessage.isPending ? "در حال ارسال…" : "ارسال پاسخ"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {ticket.status === "RESOLVED" && (
        <Card>
          <CardHeader><CardTitle className="text-base">آیا مشکل شما حل شده است؟</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {ticket.resolutionSummary && (
              <div className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap">
                {ticket.resolutionSummary}
              </div>
            )}
            {ticket.resolutionConfirmation && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                اگر تا {formatDate(ticket.resolutionConfirmation.autoCloseAt)} پاسخی ثبت نشود،
                درخواست پس از دو یادآوری به‌صورت خودکار بسته می‌شود.
              </p>
            )}
            <Label htmlFor="resolution-reason">اگر حل نشده، دلیل را بنویسید</Label>
            <Textarea
              id="resolution-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={transition.isPending}
                onClick={() => runTransition("confirm-resolution")}
              >
                <CheckCircle2 className="ml-2 h-4 w-4" /> بله، حل شد
              </Button>
              <Button
                variant="destructive"
                disabled={!reason.trim() || transition.isPending}
                onClick={() => runTransition("reject-resolution")}
              >
                <XCircle className="ml-2 h-4 w-4" /> خیر، ادامه بررسی
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {ticket.status === "CLOSED" && (
        <Card>
          <CardContent className="space-y-5 p-5">
            {!ticket.rating && (
              <div className="space-y-3">
                <p className="font-medium">از رسیدگی انجام‌شده رضایت داشتید؟</p>
                <div className="flex gap-1" dir="ltr">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      type="button"
                      key={value}
                      aria-label={`امتیاز ${toPersianDigits(value)}`}
                      onClick={() => setSelectedRating(value)}
                    >
                      <Star
                        className={cn(
                          "h-7 w-7",
                          value <= selectedRating
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground"
                        )}
                      />
                    </button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  disabled={selectedRating === 0 || rate.isPending}
                  onClick={submitRating}
                >
                  ثبت امتیاز
                </Button>
              </div>
            )}
            {ticket.rating && (
              <p className="text-sm text-muted-foreground">
                امتیاز ثبت‌شده: {toPersianDigits(ticket.rating)} از ۵
              </p>
            )}
            <div className="border-t pt-4">
              <Label htmlFor="reopen-reason">دلیل بازگشایی</Label>
              <Textarea
                id="reopen-reason"
                className="mt-2"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
              />
              <Button
                className="mt-3"
                variant="outline"
                disabled={!reason.trim() || transition.isPending}
                onClick={() => runTransition("reopen")}
              >
                <RotateCcw className="ml-2 h-4 w-4" /> بازگشایی درخواست
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {mutationError && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {mutationError}
        </div>
      )}
    </div>
  );
}
