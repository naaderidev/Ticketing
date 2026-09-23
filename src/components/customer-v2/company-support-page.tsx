"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Boxes,
  Building2,
  FileSignature,
  GitBranch,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useCompanySupportOverview,
  useCustomerTicketsV2,
  usePartyContexts,
} from "@/hooks";
import { toPersianDigits } from "@/lib/format";

const ROLE_LABELS = {
  MANAGER: "مدیر شرکت",
  REPRESENTATIVE: "نماینده مجاز",
} as const;

function EmptyCollection({ message }: Readonly<{ message: string }>) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{message}</p>;
}

export function CompanySupportPage() {
  const contexts = usePartyContexts();
  const activeContext = contexts.data?.contexts.find(
    (context) => context.partyId === contexts.data?.activePartyId
  );
  const isOrganization = activeContext?.type === "ORGANIZATION";
  const overview = useCompanySupportOverview(
    activeContext?.partyId,
    Boolean(isOrganization)
  );
  const tickets = useCustomerTicketsV2(
    { limit: 6 },
    isOrganization ? activeContext?.partyId : undefined
  );

  if (contexts.isLoading) {
    return <p className="py-12 text-center text-muted-foreground">در حال دریافت حساب‌های مجاز…</p>;
  }
  if (contexts.error) {
    return (
      <p className="rounded-lg bg-destructive/10 p-4 text-destructive" role="alert">
        دریافت حساب‌های مجاز ناموفق بود.
      </p>
    );
  }
  if (!isOrganization) {
    const organizations = contexts.data?.contexts.filter(
      (context) => context.type === "ORGANIZATION"
    );
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">پشتیبانی شرکت</h1>
          <p className="text-muted-foreground">
            تیکت‌ها، قراردادها، شعبه‌ها و نمایندگان مجاز شرکت در این صفحه نمایش داده می‌شوند.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <Building2 className="h-12 w-12 text-primary" />
            <div>
              <p className="font-semibold">اکنون حساب فردی فعال است</p>
              <p className="mt-1 text-sm text-muted-foreground">
                از انتخاب‌گر حساب در سربرگ، یکی از شرکت‌های مجاز خود را انتخاب کنید.
              </p>
            </div>
            {organizations?.length === 0 && (
              <p className="rounded-lg bg-muted p-3 text-sm">
                برای این کاربر هنوز عضویت فعال شرکتی ثبت نشده است.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
  if (overview.isLoading) {
    return <p className="py-12 text-center text-muted-foreground">در حال آماده‌سازی نمای شرکت…</p>;
  }
  if (overview.error || !overview.data) {
    return (
      <p className="rounded-lg bg-destructive/10 p-4 text-destructive" role="alert">
        {overview.error?.message ?? "دریافت نمای پشتیبانی شرکت ناموفق بود."}
      </p>
    );
  }

  const data = overview.data;
  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">پشتیبانی {data.organization.legalName}</h1>
            <Badge variant="secondary">{ROLE_LABELS[data.organization.role]}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            نمای یکپارچه درخواست‌ها و محدوده‌های مجاز شرکت
          </p>
        </div>
        <Link href="/user/tickets/new">
          <Button>ثبت درخواست برای شرکت</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-5"><Ticket className="h-6 w-6 text-primary" /><div><p className="text-xs text-muted-foreground">تیکت‌های اخیر</p><p className="font-bold">{toPersianDigits(tickets.data?.data.length ?? 0)}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-5"><GitBranch className="h-6 w-6 text-primary" /><div><p className="text-xs text-muted-foreground">شعبه‌ها</p><p className="font-bold">{toPersianDigits(data.branches.length)}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-5"><FileSignature className="h-6 w-6 text-primary" /><div><p className="text-xs text-muted-foreground">قراردادها</p><p className="font-bold">{toPersianDigits(data.contracts.length)}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-5"><Users className="h-6 w-6 text-primary" /><div><p className="text-xs text-muted-foreground">نمایندگان مجاز</p><p className="font-bold">{toPersianDigits(data.representatives.length)}</p></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">تیکت‌های شرکت</CardTitle>
          <Link href="/user/tickets" className="text-sm text-primary hover:underline">
            مشاهده همه <ArrowLeft className="mr-1 inline h-4 w-4" />
          </Link>
        </CardHeader>
        <CardContent>
          {tickets.isLoading && <p className="py-6 text-center text-muted-foreground">در حال دریافت…</p>}
          {tickets.error && <p className="text-sm text-destructive">دریافت تیکت‌های شرکت ناموفق بود.</p>}
          {tickets.data?.data.length === 0 && <EmptyCollection message="برای این شرکت هنوز تیکتی ثبت نشده است." />}
          <div className="divide-y">
            {tickets.data?.data.map((ticket) => (
              <Link key={ticket.ticketId} href={`/user/tickets/${ticket.ticketId}`} className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                <span className="min-w-0"><span className="block truncate font-medium">{ticket.subject}</span><span className="text-xs text-muted-foreground">{ticket.ticketId} · {ticket.requestType.name}</span></span>
                <Badge variant="outline">{ticket.status === "WAITING_USER" ? "منتظر پاسخ شما" : ticket.status === "IN_PROGRESS" ? "در حال بررسی" : ticket.status === "RESOLVED" ? "حل شده" : "بسته شده"}</Badge>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">گزارش نتایج شرکت</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">نتایج بازبینی‌شده</p><p className="text-xl font-bold">{toPersianDigits(data.companyReport.reviewedCount)}</p></div>
            <div className="rounded-lg border border-emerald-300 p-3"><p className="text-xs text-muted-foreground">تأیید نهایی</p><p className="text-xl font-bold">{toPersianDigits(data.companyReport.approvedCount)}</p></div>
            <div className="rounded-lg border border-amber-300 p-3"><p className="text-xs text-muted-foreground">در انتظار مدیر حساب</p><p className="text-xl font-bold">{toPersianDigits(data.companyReport.pendingCount)}</p></div>
          </div>
          {data.companyReport.results.length === 0 ? <EmptyCollection message="هنوز نتیجه‌ای برای بازبینی مدیر حساب ثبت نشده است." /> : <div className="divide-y">{data.companyReport.results.map((result) => <Link key={result.ticketId} href={`/user/tickets/${result.ticketId}`} className="block py-3"><div className="flex items-center justify-between gap-3"><span className="font-medium">{result.subject}</span><Badge variant="outline">{result.status === "PENDING" ? "در انتظار" : result.status === "APPROVED" ? "تأیید شده" : "نیازمند اصلاح"}</Badge></div>{result.resolutionSummary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{result.resolutionSummary}</p>}</Link>)}</div>}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><GitBranch className="h-5 w-5 text-primary" /> شعبه‌ها</CardTitle></CardHeader>
          <CardContent>
            {data.branches.length === 0 && <EmptyCollection message="شعبه‌ای در محدوده مجاز شما نیست." />}
            <div className="space-y-2">{data.branches.map((branch) => <div key={branch.id} className="flex items-center justify-between rounded-lg border p-3"><span>{branch.name}</span><code className="text-xs text-muted-foreground">{branch.code}</code></div>)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5 text-primary" /> نمایندگان مجاز</CardTitle></CardHeader>
          <CardContent>
            {data.representatives.length === 0 && <EmptyCollection message="نماینده فعالی ثبت نشده است." />}
            <div className="space-y-2">{data.representatives.map((representative) => <div key={representative.id} className="flex items-center justify-between rounded-lg border p-3"><span>{representative.name}{representative.isCurrentUser ? " (شما)" : ""}</span><Badge variant="secondary">{ROLE_LABELS[representative.role]}</Badge></div>)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileSignature className="h-5 w-5 text-primary" /> قراردادها</CardTitle></CardHeader>
          <CardContent>
            {data.contracts.length === 0 && <EmptyCollection message="قراردادی در محدوده مجاز یا تیکت‌های شرکت ثبت نشده است." />}
            <div className="space-y-2">{data.contracts.map((contract) => <div key={contract.key} className="rounded-lg border p-3"><p>{contract.label}</p><code className="text-xs text-muted-foreground">{contract.key}</code></div>)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Boxes className="h-5 w-5 text-primary" /> دارایی‌ها</CardTitle></CardHeader>
          <CardContent>
            {data.assets.length === 0 && <EmptyCollection message="دارایی‌ای در محدوده مجاز یا تیکت‌های شرکت ثبت نشده است." />}
            <div className="space-y-2">{data.assets.map((asset) => <div key={asset.key} className="flex items-center justify-between rounded-lg border p-3"><span>{asset.label}</span><ShieldCheck className="h-4 w-4 text-emerald-600" /></div>)}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
