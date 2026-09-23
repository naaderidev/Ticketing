"use client";

import { useDeferredValue, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  BookOpenText,
  CheckCircle2,
  Clock3,
  Inbox,
  MessagesSquare,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUser } from "@/contexts/user-context";
import {
  useConfirmKnowledgeResolution,
  useCustomerKnowledgeArticles,
  useCustomerTicketsV2,
  usePartyContexts,
  useStartKnowledgeJourney,
} from "@/hooks";
import { useCustomerIncidents } from "@/hooks/support-incidents";
import { formatDate, toPersianDigits } from "@/lib/format";
import type { StartedKnowledgeJourney } from "@/types/customer-support-center";
import type { CustomerTicketStatus } from "@/types/customer-ticket-v2";

const STATUS_LABELS: Record<CustomerTicketStatus, string> = {
  IN_PROGRESS: "در حال بررسی",
  WAITING_USER: "منتظر پاسخ شما",
  RESOLVED: "حل شده",
  CLOSED: "بسته شده",
};

const MATCH_CONFIDENCE_LABELS = {
  HIGH: "تطابق زیاد",
  MEDIUM: "تطابق متوسط",
  LOW: "تطابق احتمالی",
} as const;

function ticketCreationHref(journey: StartedKnowledgeJourney): string {
  const params = new URLSearchParams({
    journeyId: journey.journey.id,
    subject: journey.article.title,
  });
  if (journey.article.requestType) {
    params.set("requestTypeId", String(journey.article.requestType.id));
  }
  return `/user/tickets/new?${params.toString()}`;
}

export function CustomerDashboard() {
  const { user } = useUser();
  const contexts = usePartyContexts();
  const activeContext = contexts.data?.contexts.find(
    (context) => context.partyId === contexts.data?.activePartyId
  );
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [journey, setJourney] = useState<StartedKnowledgeJourney | null>(null);
  const [resolutionConfirmed, setResolutionConfirmed] = useState(false);
  const articles = useCustomerKnowledgeArticles({
    query: deferredSearch,
    activePartyId: activeContext?.partyId,
  });
  const recentTickets = useCustomerTicketsV2({ limit: 8 }, activeContext?.partyId);
  const incidents = useCustomerIncidents(activeContext?.partyId);
  const startJourney = useStartKnowledgeJourney();
  const confirmResolution = useConfirmKnowledgeResolution();
  const waitingForCustomer = recentTickets.data?.data.filter(
    (ticket) => ticket.status === "WAITING_USER"
  );
  const activeConversations = recentTickets.data?.data.filter((ticket) =>
    (["IN_PROGRESS", "WAITING_USER"] as CustomerTicketStatus[]).includes(
      ticket.status
    )
  );
  const showingSearchResults = deferredSearch.trim().length >= 2;
  const recommendedArticle = articles.data?.find((article) => article.isRecommended);
  const hasOnlyLowConfidenceResults = Boolean(
    showingSearchResults &&
      articles.data?.length &&
      articles.data.every((article) => article.matchConfidence === "LOW")
  );

  function openArticle(articleId: number) {
    setResolutionConfirmed(false);
    startJourney.mutate(
      { articleId, question: search.trim() || undefined },
      { onSuccess: setJourney }
    );
  }

  function confirmSolved() {
    if (!journey) return;
    confirmResolution.mutate(journey.journey.id, {
      onSuccess: () => setResolutionConfirmed(true),
    });
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-l from-primary/10 via-background to-background p-6 sm:p-8">
        <div className="mx-auto max-w-3xl space-y-5 text-center">
          <div>
            <p className="mb-2 text-sm font-medium text-primary">مرکز پشتیبانی</p>
            <h1 className="text-2xl font-bold sm:text-3xl">
              سلام{user ? ` ${user.firstName}` : ""}، چطور می‌توانیم کمک کنیم؟
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              پاسخ سؤال را جست‌وجو کنید؛ اگر حل نشد، همان مسیر را به درخواست پشتیبانی تبدیل کنید.
            </p>
          </div>
          <div className="relative text-right">
            <Search className="absolute right-4 top-3.5 h-5 w-5 text-muted-foreground" />
            <Input
              aria-label="جست‌وجوی سؤال"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="مثلاً بازیابی حساب، پرداخت یا قرارداد"
              className="h-12 rounded-xl bg-background pr-11 shadow-sm"
              maxLength={100}
              autoComplete="off"
            />
          </div>
          {search.length === 1 && (
            <p className="text-xs text-muted-foreground">
              برای جست‌وجو حداقل دو نویسه وارد کنید.
            </p>
          )}
        </div>
      </section>

      {incidents.data?.some((incident) => !["RESOLVED", "CLOSED"].includes(incident.status)) && (
        <section aria-label="اطلاعیه رخدادهای عمومی" className="space-y-3">
          {incidents.data
            .filter((incident) => !["RESOLVED", "CLOSED"].includes(incident.status))
            .map((incident) => (
              <div key={incident.incidentKey} className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold">{incident.title}</p>
                    <p className="mt-1 text-sm leading-6">{incident.initialNotice ?? incident.description}</p>
                    <p className="mt-2 font-mono text-xs opacity-75">{incident.incidentKey}</p>
                  </div>
                </div>
              </div>
            ))}
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-primary/10 p-3">
              <MessagesSquare className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">گفتگوهای فعال</p>
              <p className="font-semibold">
                {toPersianDigits(activeConversations?.length ?? 0)} گفتگو
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className={waitingForCustomer?.length ? "border-amber-300" : undefined}>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-amber-100 p-3 dark:bg-amber-950/40">
              <AlertCircle className="h-6 w-6 text-amber-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">نیازمند پاسخ شما</p>
              <p className="font-semibold">
                {toPersianDigits(waitingForCustomer?.length ?? 0)} درخواست
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm text-muted-foreground">پاسخ را پیدا نکردید؟</p>
              <p className="font-semibold">درخواست جدید ثبت کنید</p>
            </div>
            <Link href="/user/tickets/new">
              <Button size="icon" aria-label="درخواست جدید">
                <Plus className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="knowledge-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="knowledge-heading" className="text-xl font-bold">
              {showingSearchResults ? "نتیجه جست‌وجو" : "موضوع‌های پرتکرار"}
            </h2>
            <p className="text-sm text-muted-foreground">
              راهنماهای تأییدشده و مرتبط با خدمات پشتیبانی
            </p>
          </div>
          {!showingSearchResults && <Sparkles className="h-5 w-5 text-primary" />}
        </div>
        {articles.isLoading && (
          <p className="py-8 text-center text-muted-foreground" role="status">
            در حال دریافت راهنماها…
          </p>
        )}
        {articles.error && (
          <p className="rounded-lg bg-destructive/10 p-3 text-destructive" role="alert">
            دریافت راهنماهای مرکز پشتیبانی ناموفق بود.
          </p>
        )}
        {recommendedArticle && (
          <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">موضوع احتمالی: {recommendedArticle.detectedTopic ?? recommendedArticle.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {MATCH_CONFIDENCE_LABELS[recommendedArticle.matchConfidence]}. پاسخ فقط از محتوای تأییدشده پیشنهاد شده است.
              </p>
            </div>
            <Button type="button" onClick={() => openArticle(recommendedArticle.id)} disabled={startJourney.isPending}>
              مشاهده پاسخ پیشنهادی
            </Button>
          </div>
        )}
        {hasOnlyLowConfidenceResults && (
          <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              سیستم موضوع را با اطمینان کافی تشخیص نداد؛ برای جلوگیری از پاسخ نادرست، درخواست را به کارشناس بسپارید.
            </p>
            <Link href="/user/tickets/new"><Button variant="outline">ثبت درخواست</Button></Link>
          </div>
        )}
        {articles.data?.length === 0 && (
          <div className="space-y-3 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            <p>پاسخ تأییدشده‌ای با اطمینان کافی پیدا نشد.</p>
            <Link href="/user/tickets/new"><Button>ثبت درخواست برای کارشناس</Button></Link>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {articles.data?.map((article) => (
            <button
              key={article.id}
              type="button"
              onClick={() => openArticle(article.id)}
              disabled={startJourney.isPending}
              className="group rounded-xl border bg-card p-5 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <span className="mb-4 flex items-start justify-between gap-3">
                <span className="rounded-lg bg-primary/10 p-2 text-primary">
                  <BookOpenText className="h-5 w-5" />
                </span>
                {article.isRecommended ? (
                  <Badge>پاسخ پیشنهادی</Badge>
                ) : article.isFrequent ? (
                  <Badge variant="secondary">پرتکرار</Badge>
                ) : showingSearchResults ? (
                  <Badge variant="outline">{MATCH_CONFIDENCE_LABELS[article.matchConfidence]}</Badge>
                ) : null}
              </span>
              <span className="block font-semibold leading-7">{article.title}</span>
              <span className="mt-2 line-clamp-2 block text-sm leading-6 text-muted-foreground">
                {article.excerpt}
              </span>
              {article.service && (
                <span className="mt-4 block text-xs text-primary">
                  {article.service.name}
                </span>
              )}
            </button>
          ))}
        </div>
        {startJourney.error && (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {startJourney.error.message}
          </p>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">گفتگو</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                گفتگوهای باز یا منتظر پاسخ شما
              </p>
            </div>
            <MessagesSquare className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            {activeConversations?.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                گفتگوی فعالی ندارید.
              </p>
            )}
            <div className="divide-y">
              {activeConversations?.slice(0, 4).map((ticket) => (
                <Link
                  key={ticket.ticketId}
                  href={`/user/tickets/${ticket.ticketId}`}
                  className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{ticket.subject}</span>
                    <span className="text-xs text-muted-foreground">{ticket.ticketId}</span>
                  </span>
                  <Badge variant="outline">{STATUS_LABELS[ticket.status]}</Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">درخواست‌های من</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                آخرین درخواست‌ها در حساب فعال
              </p>
            </div>
            <Link href="/user/tickets" className="text-sm text-primary hover:underline">
              مشاهده همه <ArrowLeft className="mr-1 inline h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {(recentTickets.isLoading || contexts.isLoading) && (
              <p className="py-8 text-center text-muted-foreground" role="status">
                در حال دریافت…
              </p>
            )}
            {(recentTickets.error || contexts.error) && (
              <p className="rounded-lg bg-destructive/10 p-3 text-destructive" role="alert">
                دریافت درخواست‌ها ناموفق بود.
              </p>
            )}
            {recentTickets.data?.data.length === 0 && (
              <div className="flex flex-col items-center py-8 text-center">
                <Inbox className="mb-3 h-9 w-9 text-muted-foreground" />
                <p>هنوز درخواستی ثبت نکرده‌اید.</p>
              </div>
            )}
            <div className="divide-y">
              {recentTickets.data?.data.slice(0, 4).map((ticket) => (
                <Link
                  key={ticket.ticketId}
                  href={`/user/tickets/${ticket.ticketId}`}
                  className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{ticket.subject}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock3 className="h-3 w-3" /> {formatDate(ticket.updatedAt)}
                    </span>
                  </span>
                  <Badge variant="outline">{STATUS_LABELS[ticket.status]}</Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={journey !== null}
        onOpenChange={(open) => {
          if (!open) setJourney(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {journey && (
            <>
              <DialogHeader>
                <DialogTitle className="leading-7">{journey.article.title}</DialogTitle>
                <DialogDescription>
                  {journey.article.service?.name ?? "راهنمای مرکز پشتیبانی"}
                  {journey.article.requestType
                    ? ` / ${journey.article.requestType.name}`
                    : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="whitespace-pre-wrap rounded-xl bg-muted/40 p-4 text-sm leading-7">
                {journey.article.body}
              </div>
              {resolutionConfirmed ? (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  خوشحالیم که مشکل حل شد. نتیجه برای بهبود مرکز پشتیبانی ثبت شد.
                </div>
              ) : (
                <DialogFooter className="gap-2 sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={confirmSolved}
                    disabled={confirmResolution.isPending}
                  >
                    <CheckCircle2 className="ml-2 h-4 w-4" />
                    مشکلم حل شد
                  </Button>
                  {journey.article.requestType ? (
                    <Link href={ticketCreationHref(journey)}>
                      <Button>هنوز کمک می‌خواهم؛ ثبت درخواست</Button>
                    </Link>
                  ) : (
                    <Link href="/user/tickets/new">
                      <Button>ثبت درخواست جدید</Button>
                    </Link>
                  )}
                </DialogFooter>
              )}
              {confirmResolution.error && (
                <p className="text-sm text-destructive" role="alert">
                  {confirmResolution.error.message}
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
