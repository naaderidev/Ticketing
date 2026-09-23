"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Search,
  Send,
} from "lucide-react";
import { FileUpload } from "@/components/shared/file-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CustomerApiError,
  useBusinessReferenceSearch,
  useCreateCustomerTicketV2,
  useCustomerSupportCatalogV2,
  useCustomerTicketsV2,
  usePartyContexts,
} from "@/hooks";
import { useCustomerKnowledgeJourney } from "@/hooks/customer-support-center";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/format";
import type { PendingAttachment } from "@/types/ticket";
import type {
  BusinessReferenceOption,
  CreateCustomerTicketCommand,
  CustomerCatalogRequestType,
  CustomerCatalogService,
} from "@/types/customer-ticket-v2";

const EXTERNAL_SUBJECTS = new Set([
  "CONTRACT",
  "INVOICE",
  "PAYMENT",
  "SETTLEMENT",
  "POWER_PLANT",
  "METER",
  "SAVING_PROGRAM",
]);

type SelectedReference = { type: string; key: string; label: string };

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${toPersianDigits(minutes)} دقیقه`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${toPersianDigits(hours)} ساعت`;
  return `${toPersianDigits(Math.ceil(hours / 24))} روز`;
}

const MAX_TICKET_DESCRIPTION_LENGTH = 5_000;

function buildJourneyTicketDescription(input: {
  question: string | null;
  articleTitle: string | null;
  conversation: Array<{
    author: "CUSTOMER" | "SYSTEM";
    kind: "QUESTION" | "GUIDANCE" | "OUTCOME" | "HANDOFF";
    body: string;
  }>;
}): string {
  const transcript = input.conversation
    .filter((message) => ["QUESTION", "GUIDANCE"].includes(message.kind))
    .map(
      (message) =>
        `${message.author === "CUSTOMER" ? "کاربر" : "راهنمای خودکار"}: ${message.body}`
    )
    .join("\n\n");
  const fallbackTranscript = [
    input.question ? `کاربر: ${input.question}` : null,
    `راهنمای مشاهده‌شده: ${input.articleTitle ?? "راهنمای مرکز پشتیبانی"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const footer =
    "\n\nنتیجه: راهنمای پیشنهادی مشکل را حل نکرد و درخواست برای بررسی کارشناس ادامه یافته است.";
  return `${transcript || fallbackTranscript}${footer}`.slice(
    0,
    MAX_TICKET_DESCRIPTION_LENGTH
  );
}

function StepIndicator({ current }: Readonly<{ current: number }>) {
  const steps = ["انتخاب خدمت", "نوع درخواست", "شرح و ارسال"];
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="مراحل ثبت تیکت">
      {steps.map((label, index) => {
        const number = index + 1;
        const completed = current > number;
        return (
          <li key={label} className="space-y-2 text-center">
            <div
              className={cn(
                "mx-auto flex h-9 w-9 items-center justify-center rounded-full border text-sm font-bold",
                current === number && "border-primary bg-primary text-primary-foreground",
                completed && "border-emerald-600 bg-emerald-600 text-white",
                current < number && "border-border text-muted-foreground"
              )}
              aria-current={current === number ? "step" : undefined}
            >
              {completed ? <Check className="h-4 w-4" /> : toPersianDigits(number)}
            </div>
            <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
          </li>
        );
      })}
    </ol>
  );
}

function SelectableCard({
  title,
  description,
  selected,
  onClick,
}: Readonly<{
  title: string;
  description: string | null;
  selected: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border p-4 text-right transition-colors hover:border-primary/60 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary bg-primary/5"
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span>
          <span className="block font-semibold">{title}</span>
          {description && (
            <span className="mt-1 block text-sm text-muted-foreground">
              {description}
            </span>
          )}
        </span>
        {selected && <Check className="mt-1 h-5 w-5 shrink-0 text-primary" />}
      </span>
    </button>
  );
}

function ExternalReferencePicker({
  activePartyId,
  subjectType,
  enabled,
  selected,
  onSelect,
}: Readonly<{
  activePartyId: number | undefined;
  subjectType: string;
  enabled: boolean;
  selected: SelectedReference | null;
  onSelect: (reference: SelectedReference) => void;
}>) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const search = useBusinessReferenceSearch({
    activePartyId,
    subjectType,
    query: deferredQuery,
    enabled,
  });

  if (!enabled) {
    return (
      <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <p>
          سرویس مرجع این درخواست هنوز فعال نشده است. برای جلوگیری از ثبت اطلاعات
          تأییدنشده، ارسال این نوع تیکت موقتاً غیرفعال است.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Label htmlFor="business-reference-search">مرجع مرتبط</Label>
      <div className="relative">
        <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          id="business-reference-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="حداقل دو نویسه از شناسه یا عنوان"
          className="pr-9"
          autoComplete="off"
        />
      </div>
      {search.isFetching && (
        <p className="text-sm text-muted-foreground" role="status">
          در حال جست‌وجوی امن…
        </p>
      )}
      {search.error && (
        <p className="text-sm text-destructive" role="alert">
          {search.error.message}
        </p>
      )}
      {search.data && search.data.length === 0 && deferredQuery.trim().length >= 2 && (
        <p className="text-sm text-muted-foreground">موردی پیدا نشد.</p>
      )}
      <div className="space-y-2">
        {search.data?.map((reference: BusinessReferenceOption) => (
          <button
            type="button"
            key={`${reference.sourceSystem}:${reference.externalId}`}
            onClick={() =>
              onSelect({
                type: reference.entityType,
                key: reference.externalId,
                label: reference.displayLabel,
              })
            }
            className={cn(
              "w-full cursor-pointer rounded-lg border p-3 text-right text-sm hover:border-primary",
              selected?.key === reference.externalId && "border-primary bg-primary/5"
            )}
          >
            {reference.displayLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CustomerTicketCreate({
  businessReferenceIntegrationEnabled,
  initialSupportJourneyId,
  initialRequestTypeId,
  initialSubject,
}: Readonly<{
  businessReferenceIntegrationEnabled: boolean;
  initialSupportJourneyId?: string;
  initialRequestTypeId?: number;
  initialSubject?: string;
}>) {
  const router = useRouter();
  const catalog = useCustomerSupportCatalogV2();
  const contexts = usePartyContexts();
  const activePartyId = contexts.data?.activePartyId;
  const relatedTickets = useCustomerTicketsV2({ limit: 25 }, activePartyId);
  const createTicket = useCreateCustomerTicketV2();
  const journeyContext = useCustomerKnowledgeJourney(initialSupportJourneyId);
  const [step, setStep] = useState(1);
  const [service, setService] = useState<CustomerCatalogService | null>(null);
  const [requestType, setRequestType] =
    useState<CustomerCatalogRequestType | null>(null);
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [reference, setReference] = useState<SelectedReference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submission = useRef<{ payload: string; key: string } | null>(null);
  const initialSelectionApplied = useRef(false);
  const initialJourneyContextApplied = useRef(false);

  useEffect(() => {
    if (initialJourneyContextApplied.current || !journeyContext.data) return;
    initialJourneyContextApplied.current = true;
    setDescription(buildJourneyTicketDescription(journeyContext.data.context));
  }, [journeyContext.data]);

  useEffect(() => {
    if (
      initialSelectionApplied.current ||
      !initialRequestTypeId ||
      !catalog.data
    ) {
      return;
    }
    const matchedService = catalog.data.find((candidate) =>
      candidate.requestTypes.some((item) => item.id === initialRequestTypeId)
    );
    const matchedRequestType = matchedService?.requestTypes.find(
      (item) => item.id === initialRequestTypeId
    );
    initialSelectionApplied.current = true;
    if (!matchedService || !matchedRequestType) return;
    setService(matchedService);
    setRequestType(matchedRequestType);
    setStep(3);
  }, [catalog.data, initialRequestTypeId]);

  const activeContext = contexts.data?.contexts.find(
    (context) => context.partyId === contexts.data?.activePartyId
  );
  const externalSubject = Boolean(
    requestType?.businessSubjectType &&
      EXTERNAL_SUBJECTS.has(requestType.businessSubjectType)
  );
  const organizationSubject =
    requestType?.businessSubjectType === "ORGANIZATION_MEMBERSHIP";
  const relatedTicketSubject =
    requestType?.businessSubjectType === "RELATED_TICKET";

  const businessReferenceReady = useMemo(() => {
    if (!requestType?.requiresBusinessSubject) return true;
    if (organizationSubject) return Boolean(activeContext?.organization);
    if (relatedTicketSubject) return Boolean(reference);
    if (externalSubject) {
      return businessReferenceIntegrationEnabled && Boolean(reference);
    }
    return false;
  }, [
    activeContext?.organization,
    businessReferenceIntegrationEnabled,
    externalSubject,
    organizationSubject,
    reference,
    relatedTicketSubject,
    requestType,
  ]);

  function selectService(selected: CustomerCatalogService) {
    setService(selected);
    setRequestType(null);
    setReference(null);
  }

  function selectRequestType(selected: CustomerCatalogRequestType) {
    setRequestType(selected);
    setReference(null);
  }

  function buildCommand(): CreateCustomerTicketCommand | null {
    if (!requestType || !subject.trim() || !description.trim()) return null;
    const businessReferences =
      requestType.requiresBusinessSubject && reference
        ? [{ type: reference.type, key: reference.key }]
        : [];
    return {
      requestTypeId: requestType.id,
      subject: subject.trim(),
      description: description.trim(),
      ...(initialSupportJourneyId && requestType.id === initialRequestTypeId
        ? { supportJourneyId: initialSupportJourneyId }
        : {}),
      businessReferences,
      attachments: attachments.map(({ uploadId }) => ({ uploadId })),
    };
  }

  function submit() {
    const command = buildCommand();
    if (!command || !businessReferenceReady) {
      setError("اطلاعات الزامی یا مرجع مرتبط کامل نشده است.");
      return;
    }
    setError(null);
    const payload = JSON.stringify(command);
    const idempotencyKey =
      submission.current?.payload === payload
        ? submission.current.key
        : crypto.randomUUID();
    submission.current = { payload, key: idempotencyKey };
    createTicket.mutate(
      { command, idempotencyKey },
      {
        onSuccess: (ticket) => {
          submission.current = null;
          router.push(`/user/tickets/${ticket.ticketId}`);
        },
        onError: (mutationError) => {
          const suffix =
            mutationError instanceof CustomerApiError && mutationError.requestId
              ? ` (شناسه پیگیری: ${mutationError.requestId})`
              : "";
          setError(`${mutationError.message}${suffix}`);
        },
      }
    );
  }

  if (catalog.isLoading || contexts.isLoading) {
    return <p className="py-12 text-center text-muted-foreground">در حال آماده‌سازی فرم…</p>;
  }
  if (catalog.error || contexts.error) {
    return (
      <div className="rounded-lg border border-destructive/40 p-4 text-destructive" role="alert">
        {catalog.error?.message ?? contexts.error?.message ?? "بارگذاری فرم ناموفق بود."}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <StepIndicator current={step} />
      <Card>
        <CardHeader>
          <CardTitle>
            {step === 1 && "برای چه خدمتی کمک می‌خواهید؟"}
            {step === 2 && "نوع درخواست را مشخص کنید"}
            {step === 3 && "جزئیات درخواست"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {catalog.data?.map((item) => (
                <SelectableCard
                  key={item.id}
                  title={item.name}
                  description={item.description}
                  selected={service?.id === item.id}
                  onClick={() => selectService(item)}
                />
              ))}
            </div>
          )}

          {step === 2 && service && (
            <div className="space-y-3">
              {service.requestTypes.map((item) => (
                <SelectableCard
                  key={item.id}
                  title={item.name}
                  description={item.description}
                  selected={requestType?.id === item.id}
                  onClick={() => selectRequestType(item)}
                />
              ))}
            </div>
          )}

          {step === 3 && requestType && (
            <div className="space-y-5">
              {initialSupportJourneyId && requestType.id === initialRequestTypeId && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
                  این درخواست از راهنمای مرکز پشتیبانی ایجاد شده و برای سنجش نتیجه همان راهنما ثبت می‌شود.
                </div>
              )}
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{service?.name}</Badge>
                  <span className="text-sm font-medium">{requestType.name}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock3 className="h-4 w-4" /> پاسخ اولیه حدود
                    {` ${formatMinutes(requestType.slaPolicy.firstResponseMinutes)}`}
                  </span>
                  <span>
                    اولویت: {requestType.defaultPriority}
                  </span>
                </div>
              </div>

              {organizationSubject && !activeContext?.organization && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                  برای این درخواست ابتدا Context یک شرکت مجاز را از بالای صفحه انتخاب کنید.
                </div>
              )}
              {organizationSubject && activeContext?.organization && (
                <div className="rounded-lg border p-4 text-sm">
                  شرکت مرتبط: <strong>{activeContext.organization.legalName}</strong>
                </div>
              )}
              {relatedTicketSubject && (
                <div className="space-y-2">
                  <Label>تیکت مرتبط</Label>
                  <div className="grid gap-2">
                    {relatedTickets.data?.data.map((ticket) => (
                      <button
                        type="button"
                        key={ticket.ticketId}
                        className={cn(
                          "rounded-lg border p-3 text-right text-sm hover:border-primary",
                          reference?.key === ticket.ticketId && "border-primary bg-primary/5"
                        )}
                        onClick={() =>
                          setReference({
                            type: "RELATED_TICKET",
                            key: ticket.ticketId,
                            label: `${ticket.ticketId} — ${ticket.subject}`,
                          })
                        }
                      >
                        <span className="font-mono text-xs">{ticket.ticketId}</span>
                        <span className="mr-2">{ticket.subject}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {externalSubject && requestType.businessSubjectType && (
                <ExternalReferencePicker
                  activePartyId={activePartyId}
                  subjectType={requestType.businessSubjectType}
                  enabled={businessReferenceIntegrationEnabled}
                  selected={reference}
                  onSelect={setReference}
                />
              )}

              <div className="space-y-2">
                <Label htmlFor="ticket-subject">عنوان درخواست</Label>
                <Input
                  id="ticket-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={200}
                  placeholder="خلاصه‌ای روشن و کوتاه"
                />
                <p className="text-left text-xs text-muted-foreground">
                  {toPersianDigits(subject.length)} / ۲۰۰
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-description">شرح درخواست</Label>
                <Textarea
                  id="ticket-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={5000}
                  showCharacterCount={false}
                  rows={7}
                  placeholder="چه اتفاقی افتاده و چه نتیجه‌ای انتظار دارید؟"
                />
                <p className="text-left text-xs text-muted-foreground">
                  {toPersianDigits(description.length)} / ۵۰۰۰
                </p>
              </div>
              <div className="space-y-2">
                <Label>فایل‌های پیوست</Label>
                <FileUpload
                  files={attachments}
                  disabled={createTicket.isPending}
                  onUpload={(file) => setAttachments((current) => [...current, file])}
                  onRemove={(uploadId) =>
                    setAttachments((current) =>
                      current.filter((file) => file.uploadId !== uploadId)
                    )
                  }
                />
              </div>
              {error && (
                <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between border-t pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={step === 1 || createTicket.isPending}
              onClick={() => setStep((current) => Math.max(1, current - 1))}
            >
              <ArrowRight className="ml-2 h-4 w-4" /> بازگشت
            </Button>
            {step < 3 ? (
              <Button
                type="button"
                disabled={(step === 1 && !service) || (step === 2 && !requestType)}
                onClick={() => setStep((current) => Math.min(3, current + 1))}
              >
                ادامه <ArrowLeft className="mr-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                disabled={
                  createTicket.isPending ||
                  !subject.trim() ||
                  !description.trim() ||
                  !businessReferenceReady
                }
                onClick={submit}
              >
                <Send className="ml-2 h-4 w-4" />
                {createTicket.isPending ? "در حال ثبت…" : "ثبت تیکت"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
