"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, GitMerge, MessageSquare, Send, Shield, Users } from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@/contexts/user-context";
import { useWorkspaceCommand, useWorkspacePredefinedMessages, useWorkspaceQueues, useWorkspaceRootCauses, useWorkspaceTicket } from "@/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FileUpload } from "@/components/shared/file-upload";
import { StarRating } from "@/components/shared/star-rating";
import { formatDate, toPersianDigits } from "@/lib/format";
import type { PendingAttachment } from "@/types/ticket";
import type { WorkspaceTicketPriority } from "@/types/workspace-ticket-v2";
import { MESSAGE_AUTHOR_LABELS, SLA_STATE_LABELS, WORK_ITEM_STATUS_LABELS, WORKSPACE_PRIORITY_LABELS, WORKSPACE_STATUS_LABELS } from "./workspace-labels";
import { SlaCountdown } from "./sla-countdown";

type ComposeMode = "public-replies" | "internal-notes" | "request-customer-input";
const modeLabels: Record<ComposeMode, string> = { "public-replies": "پاسخ عمومی", "internal-notes": "یادداشت داخلی", "request-customer-input": "درخواست اطلاعات از مشتری" };
const priorities: WorkspaceTicketPriority[] = ["CRITICAL", "HIGH", "NORMAL", "LOW"];
const MESSAGE_MAX_LENGTH = 5000;
const makeKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export function WorkspaceTicketDetail({ ticketId }: { ticketId: string }) {
  const { user } = useUser();
  const query = useWorkspaceTicket(ticketId);
  const queues = useWorkspaceQueues();
  const canCompose = Boolean(
    query.data &&
    (query.data.capabilities.reply || query.data.capabilities.internalNote) &&
    !["CLOSED", "CLOSED_LEGACY", "RESOLVED"].includes(query.data.status)
  );
  const predefinedMessages = useWorkspacePredefinedMessages(canCompose);
  const rootCauses = useWorkspaceRootCauses(
    query.data?.requestType.service.code ?? "",
    Boolean(query.data?.capabilities.resolve && query.data.requestType.requiresRootCause)
  );
  const command = useWorkspaceCommand();
  const [mode, setMode] = useState<ComposeMode>("public-replies");
  const [message, setMessage] = useState("");
  const [predefinedMessageCategory, setPredefinedMessageCategory] = useState("");
  const [predefinedMessageId, setPredefinedMessageId] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [assignmentReason, setAssignmentReason] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferQueueId, setTransferQueueId] = useState("");
  const [priorityReason, setPriorityReason] = useState("");
  const [priorityDraft, setPriorityDraft] = useState<WorkspaceTicketPriority | null>(null);
  const [actionTaken, setActionTaken] = useState("");
  const [finalResponse, setFinalResponse] = useState("");
  const [accountReviewNote, setAccountReviewNote] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [normalizedRootCauseId, setNormalizedRootCauseId] = useState("");
  const [collaborationQueueId, setCollaborationQueueId] = useState("");
  const [collaboration, setCollaboration] = useState("");
  const [workItemResponses, setWorkItemResponses] = useState<Record<string, string>>({});
  const [mergeTargetTicketId, setMergeTargetTicketId] = useState("");
  const [mergeReason, setMergeReason] = useState("");

  const predefinedMessageCategories = useMemo(
    () =>
      Array.from(
        new Set((predefinedMessages.data ?? []).map((item) => item.category))
      ).sort((first, second) => first.localeCompare(second, "fa")),
    [predefinedMessages.data]
  );
  const categorizedPredefinedMessages = useMemo(
    () =>
      (predefinedMessages.data ?? []).filter(
        (item) => item.category === predefinedMessageCategory
      ),
    [predefinedMessageCategory, predefinedMessages.data]
  );

  const selectPredefinedMessageCategory = (category: string) => {
    setPredefinedMessageCategory(category);
    setPredefinedMessageId("");
  };

  const insertPredefinedMessage = (messageId: string) => {
    setPredefinedMessageId(messageId);
    const selected = predefinedMessages.data?.find(
      (item) => item.id === Number(messageId)
    );
    if (!selected) return;

    setMessage((current) => {
      const separator = current.trim() ? "\n\n" : "";
      return `${current}${separator}${selected.content}`.slice(
        0,
        MESSAGE_MAX_LENGTH
      );
    });
  };

  if (query.isLoading) return <p role="status" className="py-12 text-center">در حال دریافت درخواست…</p>;
  if (query.error || !query.data) return <div role="alert" className="rounded-lg bg-destructive/10 p-4 text-destructive"><p>{query.error?.message ?? "درخواست یافت نشد"}</p><Button variant="outline" className="mt-3" onClick={() => void query.refetch()}>تلاش دوباره</Button></div>;
  const ticket = query.data;
  const run = async (path: string, body: unknown, success: string) => {
    try {
      await command.mutateAsync({ ticketId, version: ticket.version, path, body, idempotencyKey: makeKey() });
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "عملیات ناموفق بود");
      return false;
    }
  };
  const sendMessage = async () => {
    const succeeded = await run(mode, { message, attachments: attachments.map(({ uploadId }) => ({ uploadId })) }, modeLabels[mode] + " ثبت شد");
    if (succeeded) {
      setMessage("");
      setPredefinedMessageCategory("");
      setPredefinedMessageId("");
      setAttachments([]);
    }
  };
  const changeOwnership = async (ownerUserId: number) => {
    const succeeded = await run("assign", { ownerUserId, reason: assignmentReason }, "درخواست به شما تخصیص یافت");
    if (succeeded) setAssignmentReason("");
  };
  const transferTicket = async () => {
    const succeeded = await run("transfer", { queueId: Number(transferQueueId), reason: transferReason }, "تیکت منتقل شد");
    if (succeeded) {
      setTransferQueueId("");
      setTransferReason("");
    }
  };
  const changePriority = async () => {
    const priority = priorityDraft ?? ticket.priority;
    const succeeded = await run("priority-change", { priority, reason: priorityReason }, "اولویت تغییر کرد");
    if (succeeded) {
      setPriorityDraft(null);
      setPriorityReason("");
    }
  };
  const addCollaboration = async () => {
    const succeeded = await run("collaborators", { queueId: Number(collaborationQueueId), request: collaboration }, "درخواست همکاری ثبت شد");
    if (succeeded) {
      setCollaborationQueueId("");
      setCollaboration("");
    }
  };
  const finishWorkItem = async (workItemId: string, action: "complete" | "cancel") => {
    const response = workItemResponses[workItemId] ?? "";
    const succeeded = await run(
      `work-items/${workItemId}/${action}`,
      action === "complete" ? { response } : { reason: response.slice(0, 500) },
      action === "complete" ? "همکاری تکمیل شد" : "همکاری لغو شد"
    );
    if (succeeded) {
      setWorkItemResponses((current) => {
        const next = { ...current };
        delete next[workItemId];
        return next;
      });
    }
  };
  const resolveTicket = async () => {
    const succeeded = await run("resolve", { actionTaken, finalResponse, ...(rootCause.trim() ? { rootCause } : {}), ...(normalizedRootCauseId ? { normalizedRootCauseId: Number(normalizedRootCauseId) } : {}) }, "نتیجه درخواست ثبت شد");
    if (succeeded) {
      setActionTaken("");
      setFinalResponse("");
      setRootCause("");
      setNormalizedRootCauseId("");
    }
  };
  const mergeTicket = async () => {
    const succeeded = await run("merge", { targetTicketId: mergeTargetTicketId.trim().toUpperCase(), reason: mergeReason }, "تیکت تکراری ادغام شد");
    if (succeeded) {
      setMergeTargetTicketId("");
      setMergeReason("");
    }
  };
  const decideAccountReview = async (decision: "approve" | "request-changes") => {
    const succeeded = await run(`account-review/${decision}`, { note: accountReviewNote }, decision === "approve" ? "نتیجه تأیید شد" : "نتیجه برای اصلاح بازگردانده شد");
    if (succeeded) setAccountReviewNote("");
  };
  return <div className="space-y-6">
    <div><Link href="/admin/tickets" className="mb-3 inline-flex items-center text-sm text-primary"><ArrowRight className="ml-1 h-4 w-4"/>بازگشت به صف</Link><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{ticket.subject}</h1><p className="text-sm text-muted-foreground" dir="ltr">{ticket.ticketId}</p></div><div className="flex gap-2"><Badge>{WORKSPACE_STATUS_LABELS[ticket.status]}</Badge><Badge variant="outline">{WORKSPACE_PRIORITY_LABELS[ticket.priority]}</Badge></div></div></div>
    {ticket.mergedInto && <div role="status" className="rounded-xl border border-sky-300 bg-sky-50 p-4 text-sm dark:bg-sky-950/20">این تیکت با <Link className="font-semibold text-primary" href={`/admin/tickets/${ticket.mergedInto.ticketId}`}>{ticket.mergedInto.ticketId} — {ticket.mergedInto.subject}</Link> ادغام شده است.</div>}
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <div className="space-y-4">
        <Card><CardHeader><CardTitle className="text-lg">گفت‌وگو و یادداشت‌ها</CardTitle></CardHeader><CardContent className="space-y-3">{ticket.messages.map((item) => <div key={item.id} className={`rounded-xl border p-4 ${item.visibility === "INTERNAL" ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : "bg-muted/30"}`}><div className="mb-2 flex justify-between gap-2 text-xs text-muted-foreground"><span>{item.authorLabel ?? MESSAGE_AUTHOR_LABELS[item.authorType]}</span><span>{formatDate(item.createdAt)}</span></div>{item.visibility === "INTERNAL" && <Badge variant="outline" className="mb-2"><Shield className="ml-1 h-3 w-3"/>داخلی</Badge>}<p className="whitespace-pre-wrap text-sm">{item.body}</p>{item.attachments.map((file) => <a key={file.id} href={file.fileUrl} className="mt-2 block text-xs text-primary">{file.fileName}</a>)}</div>)}</CardContent></Card>
        {(ticket.actionTaken || ticket.finalResponse || ticket.rootCause) && <Card><CardHeader><CardTitle className="text-lg">نتیجه رسیدگی</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">{ticket.rootCause && <div><p className="font-medium">علت اصلی</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{ticket.rootCause}</p></div>}{ticket.actionTaken && <div><p className="font-medium">اقدام انجام‌شده</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{ticket.actionTaken}</p></div>}{ticket.finalResponse && <div><p className="font-medium">پاسخ نهایی</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{ticket.finalResponse}</p></div>}</CardContent></Card>}
        {(ticket.capabilities.reply || ticket.capabilities.internalNote) && !["CLOSED", "CLOSED_LEGACY", "RESOLVED"].includes(ticket.status) && <Card><CardHeader><CardTitle className="text-base"><MessageSquare className="ml-2 inline h-4 w-4"/>ثبت ارتباط</CardTitle></CardHeader><CardContent className="space-y-4"><Select value={mode} onValueChange={(value) => setMode(value as ComposeMode)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{ticket.capabilities.reply && <SelectItem value="public-replies">پاسخ عمومی</SelectItem>}{ticket.capabilities.internalNote && <SelectItem value="internal-notes">یادداشت داخلی</SelectItem>}{ticket.capabilities.requestCustomerInput && ticket.status === "IN_PROGRESS" && <SelectItem value="request-customer-input">درخواست اطلاعات از مشتری</SelectItem>}</SelectContent></Select><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="predefined-message-category">دسته‌بندی پاسخ آماده</Label><Select value={predefinedMessageCategory} onValueChange={selectPredefinedMessageCategory} disabled={predefinedMessages.isLoading || predefinedMessageCategories.length === 0}><SelectTrigger id="predefined-message-category" aria-label="انتخاب دسته‌بندی پاسخ آماده"><SelectValue placeholder={predefinedMessages.isLoading ? "در حال دریافت دسته‌بندی‌ها…" : predefinedMessageCategories.length > 0 ? "انتخاب دسته‌بندی" : "دسته‌بندی‌ای ثبت نشده است"}/></SelectTrigger><SelectContent>{predefinedMessageCategories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="predefined-message">پیام آماده</Label><Select value={predefinedMessageId} onValueChange={insertPredefinedMessage} disabled={!predefinedMessageCategory || categorizedPredefinedMessages.length === 0}><SelectTrigger id="predefined-message" aria-label="انتخاب پاسخ آماده"><SelectValue placeholder={!predefinedMessageCategory ? "ابتدا دسته‌بندی را انتخاب کنید" : categorizedPredefinedMessages.length > 0 ? "انتخاب پیام آماده" : "پیامی در این دسته ثبت نشده است"}/></SelectTrigger><SelectContent>{categorizedPredefinedMessages.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.title}</SelectItem>)}</SelectContent></Select></div></div>{predefinedMessages.error && <p role="alert" className="text-sm text-destructive">دریافت پاسخ‌های آماده ناموفق بود.</p>}<Textarea aria-label="متن ارتباط" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={MESSAGE_MAX_LENGTH} rows={5}/><FileUpload files={attachments} disabled={command.isPending} onUpload={(file) => setAttachments((items) => [...items, file])} onRemove={(uploadId) => setAttachments((items) => items.filter((file) => file.uploadId !== uploadId))}/><Button disabled={!message.trim() || command.isPending} onClick={() => void sendMessage()}><Send className="ml-2 h-4 w-4"/>ثبت</Button></CardContent></Card>}
        {ticket.workItems.length > 0 && <Card><CardHeader><CardTitle className="text-base"><Users className="ml-2 inline h-4 w-4"/>همکاری‌های داخلی</CardTitle></CardHeader><CardContent className="space-y-3">{ticket.workItems.map((item) => { const workItemResponse = workItemResponses[item.id] ?? ""; return <div key={item.id} className="rounded-lg border p-3 text-sm"><div className="flex justify-between"><strong>{item.supportTeam.name} / {item.queue.name}</strong><Badge variant="outline">{WORK_ITEM_STATUS_LABELS[item.status]}</Badge></div><p className="mt-2 whitespace-pre-wrap">{item.request}</p>{item.response && <p className="mt-2 rounded bg-muted p-2 whitespace-pre-wrap">نتیجه: {item.response}</p>}<p className="mt-2 text-xs text-muted-foreground">درخواست‌کننده: {item.requestedBy.name}</p>{item.status === "OPEN" && (item.capabilities.complete || item.capabilities.cancel) && <div className="mt-3 space-y-2"><Textarea value={workItemResponse} onChange={(event) => setWorkItemResponses((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="نتیجه همکاری یا دلیل لغو" maxLength={5000}/><div className="flex gap-2">{item.capabilities.complete && <Button size="sm" disabled={!workItemResponse.trim() || command.isPending} onClick={() => void finishWorkItem(item.id, "complete")}>تکمیل</Button>}{item.capabilities.cancel && <Button size="sm" variant="outline" disabled={!workItemResponse.trim() || command.isPending} onClick={() => void finishWorkItem(item.id, "cancel")}>لغو</Button>}</div></div>}</div>; })}</CardContent></Card>}
        {ticket.customerHistory.length > 0 && <Card><CardHeader><CardTitle className="text-base">سابقه مجاز مشتری</CardTitle></CardHeader><CardContent className="divide-y">{ticket.customerHistory.map((item) => <Link key={item.ticketId} href={`/admin/tickets/${item.ticketId}`} className="block py-3"><div className="flex items-center justify-between gap-3"><span className="font-medium">{item.subject}</span><span className="font-mono text-xs text-muted-foreground">{item.ticketId}</span></div><p className="mt-1 text-xs text-muted-foreground">{item.status ? WORKSPACE_STATUS_LABELS[item.status] : "وضعیت نامشخص"} · {formatDate(item.createdAt)}</p>{item.resolutionSummary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.resolutionSummary}</p>}</Link>)}</CardContent></Card>}
        {ticket.relatedHistory && ticket.relatedHistory.length > 0 && <Card><CardHeader><CardTitle className="text-base">سوابق مرتبط با دارایی یا تراکنش</CardTitle></CardHeader><CardContent className="divide-y">{ticket.relatedHistory.map((item) => <Link key={item.ticketId} href={`/admin/tickets/${item.ticketId}`} className="block py-3"><div className="flex items-center justify-between gap-3"><span className="font-medium">{item.subject}</span><span className="font-mono text-xs text-muted-foreground">{item.ticketId}</span></div>{item.resolutionSummary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.resolutionSummary}</p>}</Link>)}</CardContent></Card>}
      </div>
      <aside className="space-y-4">
        <Card><CardHeader><CardTitle className="text-base">اطلاعات عملیاتی</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p><span className="text-muted-foreground">مشتری:</span> {ticket.customer?.displayName ?? "نامشخص"}</p>{ticket.organization && <p><span className="text-muted-foreground">سازمان:</span> {ticket.organization.legalName}</p>}{ticket.organizationRole && <p><span className="text-muted-foreground">نقش نماینده:</span> {ticket.organizationRole === "MANAGER" ? "مدیر سازمان" : "نماینده مجاز"}</p>}<p><span className="text-muted-foreground">خدمت:</span> {ticket.requestType.service.name}</p><p><span className="text-muted-foreground">نوع:</span> {ticket.requestType.name}</p><p><span className="text-muted-foreground">تیم/صف:</span> {ticket.supportTeam?.name} / {ticket.queue?.name}</p><p><span className="text-muted-foreground">مالک اصلی:</span> {ticket.owner?.name ?? "بدون مالک — نیازمند رسیدگی"}</p>{ticket.servicePlan && <div className="mt-3 rounded-lg border border-blue-300 bg-blue-50 p-3 dark:bg-blue-950/20"><p className="font-medium">سطح خدمت قرارداد: {ticket.servicePlan.name}</p><p className="text-xs" dir="ltr">{ticket.servicePlan.contractReferenceKey}</p></div>}{ticket.rating !== null && <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20" aria-label={`امتیاز مشتری ${ticket.rating} از ۵`}><div><p className="font-medium">امتیاز مشتری</p><p className="text-xs text-muted-foreground">{toPersianDigits(ticket.rating)} از ۵</p></div><StarRating rating={ticket.rating} size="lg" /></div>}{ticket.sla && <div className="mt-3 space-y-2 rounded-lg bg-muted p-3"><div><p className="font-medium">پاسخ اول: {SLA_STATE_LABELS[ticket.sla.firstResponse.state] ?? ticket.sla.firstResponse.state}</p><p className="text-xs">مهلت: {formatDate(ticket.sla.firstResponse.dueAt)}</p><SlaCountdown dueAt={ticket.sla.firstResponse.dueAt} state={ticket.sla.firstResponse.state} className="text-xs text-muted-foreground"/></div><div className="border-t pt-2"><p className="font-medium">حل، چرخه {toPersianDigits(ticket.sla.resolution.cycleNumber)}: {SLA_STATE_LABELS[ticket.sla.resolution.state] ?? ticket.sla.resolution.state}</p><p className="text-xs">شروع چرخه: {formatDate(ticket.sla.resolution.cycleStartedAt)}</p><p className="text-xs">مهلت: {formatDate(ticket.sla.resolution.dueAt)}</p><SlaCountdown dueAt={ticket.sla.resolution.dueAt} state={ticket.sla.resolution.state} paused={ticket.sla.resolution.paused} className="text-xs text-muted-foreground"/>{ticket.sla.resolution.warningLevel !== "NONE" && <Badge className="mt-2 bg-amber-600">هشدار {ticket.sla.resolution.warningLevel === "NINETY" ? "۹۰٪" : "۷۰٪"}</Badge>}{ticket.sla.resolution.escalationLevel === "MANAGER" && <Badge variant="destructive" className="mt-2 mr-2">تشدید مدیریتی</Badge>}</div></div>}{ticket.resolutionCycle && <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:bg-emerald-950/20"><p className="font-medium">منتظر تأیید نتیجه</p><p className="text-xs">بستن خودکار: {formatDate(ticket.resolutionCycle.autoCloseAt)}</p><p className="text-xs">یادآوری ارسال‌شده: {ticket.resolutionCycle.reminderCount} از ۲</p></div>}</CardContent></Card>
        {ticket.businessReferences.length > 0 && <Card><CardHeader><CardTitle className="text-base">قرارداد، دارایی و تراکنش مرتبط</CardTitle></CardHeader><CardContent className="space-y-2">{ticket.businessReferences.map((reference) => <div key={`${reference.referenceType}:${reference.referenceKey}`} className="rounded-lg border p-3 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium">{reference.displayLabel ?? reference.referenceKey}</span><Badge variant="outline">{reference.verificationStatus === "VERIFIED" ? "تأییدشده" : "در انتظار تأیید"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{reference.referenceType} · <span dir="ltr">{reference.referenceKey}</span></p></div>)}</CardContent></Card>}
        {ticket.mergedTickets.length > 0 && <Card><CardHeader><CardTitle className="text-base">تیکت‌های ادغام‌شده</CardTitle></CardHeader><CardContent className="divide-y">{ticket.mergedTickets.map((item) => <Link key={item.ticketId} href={`/admin/tickets/${item.ticketId}`} className="block py-3 text-sm"><p className="font-medium">{item.ticketId} — {item.subject}</p>{item.mergeReason && <p className="mt-1 text-xs text-muted-foreground">{item.mergeReason}</p>}</Link>)}</CardContent></Card>}
        {ticket.accountReview && <Card><CardHeader><CardTitle className="text-base">بازبینی مدیر حساب</CardTitle></CardHeader><CardContent className="space-y-3"><Badge variant="outline">{ticket.accountReview.status === "PENDING" ? "در انتظار بازبینی" : ticket.accountReview.status === "APPROVED" ? "تأیید شده" : "نیازمند اصلاح"}</Badge>{ticket.accountReview.decisionNote && <p className="text-sm whitespace-pre-wrap">{ticket.accountReview.decisionNote}</p>}{ticket.capabilities.accountReview && <><Textarea value={accountReviewNote} onChange={(event) => setAccountReviewNote(event.target.value)} maxLength={2000} placeholder="توضیح تصمیم مدیر حساب"/><div className="flex gap-2"><Button disabled={!accountReviewNote.trim() || command.isPending} onClick={() => void decideAccountReview("approve")}>تأیید نهایی</Button><Button variant="outline" disabled={!accountReviewNote.trim() || command.isPending} onClick={() => void decideAccountReview("request-changes")}>بازگشت برای اصلاح</Button></div></>}</CardContent></Card>}
        {ticket.capabilities.assign && <Card><CardHeader><CardTitle className="text-base">مالکیت اصلی</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground">هر تیکت باید یک مالک اصلی داشته باشد؛ تخصیص مجدد جایگزین حذف مالک شده است.</p><Input value={assignmentReason} onChange={(event) => setAssignmentReason(event.target.value)} placeholder="دلیل تخصیص" maxLength={500}/><Button disabled={!assignmentReason.trim() || !user || command.isPending} onClick={() => void changeOwnership(user!.id)}>تخصیص به من</Button></CardContent></Card>}
        {ticket.capabilities.transfer && <Card><CardHeader><CardTitle className="text-base">انتقال صف</CardTitle></CardHeader><CardContent className="space-y-3"><Select value={transferQueueId} onValueChange={setTransferQueueId}><SelectTrigger><SelectValue placeholder="صف مقصد"/></SelectTrigger><SelectContent>{queues.data?.map((queue) => <SelectItem key={queue.id} value={String(queue.id)}>{queue.team.name} / {queue.name}</SelectItem>)}</SelectContent></Select><Input value={transferReason} onChange={(event) => setTransferReason(event.target.value)} placeholder="دلیل انتقال" maxLength={500}/><Button variant="outline" disabled={!transferQueueId || !transferReason.trim() || command.isPending} onClick={() => void transferTicket()}>انتقال</Button></CardContent></Card>}
        {ticket.capabilities.changePriority && <Card><CardHeader><CardTitle className="text-base">اولویت</CardTitle></CardHeader><CardContent className="space-y-3"><Select value={priorityDraft ?? ticket.priority} onValueChange={(value) => setPriorityDraft(value as WorkspaceTicketPriority)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{priorities.map((value) => <SelectItem key={value} value={value}>{WORKSPACE_PRIORITY_LABELS[value]}</SelectItem>)}</SelectContent></Select><Input value={priorityReason} onChange={(event) => setPriorityReason(event.target.value)} placeholder="دلیل تغییر" maxLength={500}/><Button variant="outline" disabled={!priorityReason.trim() || command.isPending} onClick={() => void changePriority()}>ثبت اولویت</Button></CardContent></Card>}
        {ticket.capabilities.collaborate && !["RESOLVED", "CLOSED", "CLOSED_LEGACY"].includes(ticket.status) && <Card><CardHeader><CardTitle className="text-base">همکاری داخلی</CardTitle></CardHeader><CardContent className="space-y-3"><Select value={collaborationQueueId} onValueChange={setCollaborationQueueId}><SelectTrigger><SelectValue placeholder="صف همکار"/></SelectTrigger><SelectContent>{queues.data?.map((queue) => <SelectItem key={queue.id} value={String(queue.id)}>{queue.team.name} / {queue.name}</SelectItem>)}</SelectContent></Select><Textarea value={collaboration} onChange={(event) => setCollaboration(event.target.value)} placeholder="شرح درخواست همکاری" maxLength={5000}/><Button variant="outline" disabled={!collaborationQueueId || !collaboration.trim() || command.isPending} onClick={() => void addCollaboration()}>ثبت همکاری</Button></CardContent></Card>}
        {ticket.capabilities.merge && <Card><CardHeader><CardTitle className="text-base"><GitMerge className="ml-2 inline h-4 w-4"/>ادغام تیکت تکراری</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground">فقط تیکت‌های همین مشتری و همین فضای سازمانی قابل ادغام‌اند.</p><Input dir="ltr" value={mergeTargetTicketId} onChange={(event) => setMergeTargetTicketId(event.target.value)} placeholder="TK-..." maxLength={100}/><Textarea value={mergeReason} onChange={(event) => setMergeReason(event.target.value)} placeholder="دلیل ادغام" maxLength={500}/><Button variant="outline" disabled={!mergeTargetTicketId.trim() || !mergeReason.trim() || command.isPending} onClick={() => void mergeTicket()}>ادغام با تیکت مقصد</Button></CardContent></Card>}
        {ticket.capabilities.resolve && ticket.status === "IN_PROGRESS" && <Card><CardHeader><CardTitle className="text-base">ثبت نتیجه درخواست</CardTitle></CardHeader><CardContent className="space-y-3">{ticket.requestType.requiresRootCause && <><Label htmlFor="normalized-root-cause">علت ریشه‌ای استاندارد</Label><Select value={normalizedRootCauseId} onValueChange={setNormalizedRootCauseId} disabled={rootCauses.isLoading}><SelectTrigger id="normalized-root-cause" aria-label="انتخاب علت ریشه‌ای استاندارد"><SelectValue placeholder={rootCauses.isLoading ? "در حال دریافت…" : "انتخاب علت استاندارد"}/></SelectTrigger><SelectContent>{rootCauses.data?.map((cause) => <SelectItem key={cause.id} value={String(cause.id)}>{cause.name}</SelectItem>)}</SelectContent></Select><Label htmlFor="root-cause">شرح تکمیلی علت ریشه‌ای</Label><Textarea id="root-cause" value={rootCause} onChange={(event) => setRootCause(event.target.value)} maxLength={5000}/></>}<Label htmlFor="action-taken">اقدام انجام‌شده</Label><Textarea id="action-taken" value={actionTaken} onChange={(event) => setActionTaken(event.target.value)} maxLength={5000}/><Label htmlFor="final-response">پاسخ نهایی به مشتری</Label><Textarea id="final-response" value={finalResponse} onChange={(event) => setFinalResponse(event.target.value)} maxLength={5000}/><Button disabled={!actionTaken.trim() || !finalResponse.trim() || (ticket.requestType.requiresRootCause && (!rootCause.trim() || !normalizedRootCauseId)) || command.isPending} onClick={() => void resolveTicket()}><CheckCircle2 className="ml-2 h-4 w-4"/>ثبت نتیجه</Button></CardContent></Card>}
      </aside>
    </div>
  </div>;
}
