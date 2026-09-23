"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Target,
  TicketCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAutomatedResolutionReport,
  useQualityReport,
  useRecurringProblemDrillDown,
  useRecurringProblemsReport,
  useReportingExport,
  useTicketPerTransactionReport,
  useTimeSlaReport,
} from "@/hooks";
import {
  createDefaultReportingRange,
  formatReportingRange,
} from "@/modules/reporting/presentation/reporting-dashboard-range";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatDateTime, toPersianDigits } from "@/lib/format";
import type {
  ReportingAccessCapabilities,
  ReportingDateRange,
  ReportingExportType,
  ReportingTransactionFilter,
} from "@/types/reporting-dashboard";

const TRANSACTION_TYPES = [
  ["PAYMENT", "پرداخت"],
  ["INVOICE", "صورتحساب"],
  ["SETTLEMENT", "تسویه"],
  ["CONTRACT", "قرارداد"],
  ["POWER_PLANT", "نیروگاه"],
  ["METER", "کنتور"],
  ["SAVING_PROGRAM", "طرح صرفه‌جویی"],
] as const;

const EXPORT_LABELS: Record<ReportingExportType, string> = {
  "time-sla": "زمان و SLA",
  quality: "کیفیت، FCR و رضایت",
  "automated-resolution": "حل خودکار",
  "ticket-per-transaction": "تیکت به ازای تراکنش",
  "recurring-problems": "مشکلات پرتکرار",
};

const UNAVAILABLE_REASONS: Record<string, string> = {
  NO_ELIGIBLE_DATA: "داده واجد شرایط وجود ندارد",
  ZERO_DENOMINATOR: "مخرج محاسبه صفر است",
  DENOMINATOR_UNAVAILABLE: "حجم تراکنش تأییدشده و کامل نیست",
  PROJECTION_UNAVAILABLE: "Projection گزارش در دسترس نیست",
  CRITICAL_DATA_QUALITY: "کیفیت داده برای انتشار کافی نیست",
  INSUFFICIENT_SAMPLE: "نمونه برای انتشار این شاخص کافی نیست",
};

const SIGNAL_STATUS_LABELS = {
  RECURRING: "پرتکرار",
  NEW_SIGNAL: "سیگنال جدید",
  BELOW_THRESHOLD: "زیر آستانه",
} as const;

const DEFAULT_PROVIDER_CODE =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
  process.env.NODE_ENV !== "production"
    ? "DEMO_PRODUCT_SEED"
    : "";

function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const numericValue =
    typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : Number(value);
  return toPersianDigits(
    new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(numericValue)
  );
}

function formatPercentage(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${formatNumber(value)}٪`;
}

function formatDuration(milliseconds: number | null | undefined): string {
  if (milliseconds === null || milliseconds === undefined) return "—";
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 60) return `${formatNumber(minutes)} دقیقه`;
  const hours = minutes / 60;
  if (hours < 24) return `${formatNumber(hours)} ساعت`;
  return `${formatNumber(hours / 24)} روز`;
}

function reasonLabel(reason: string | null | undefined): string | null {
  return reason ? (UNAVAILABLE_REASONS[reason] ?? reason) : null;
}

type MetricCardProps = {
  title: string;
  description: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  progress?: number | null;
  reason?: string | null;
  loading?: boolean;
  error?: Error | null;
};

function MetricCard({
  title,
  description,
  value,
  detail,
  icon: Icon,
  progress,
  reason,
  loading,
  error,
}: Readonly<MetricCardProps>) {
  const unavailable = reasonLabel(reason);
  return (
    <Card className={cn((error || unavailable) && "border-amber-300/80")}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <span className="rounded-lg bg-primary/10 p-2 text-primary" aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="space-y-3" role="status" aria-label={`در حال دریافت ${title}`}>
            <div className="h-8 w-28 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive" role="alert">{error.message}</p>
        ) : (
          <>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            {progress !== undefined && progress !== null && (
              <Progress
                value={Math.min(100, Math.max(0, progress))}
                aria-label={`${title}: ${formatPercentage(progress)}`}
                className="h-2"
              />
            )}
            <p className={cn("text-xs text-muted-foreground", unavailable && "text-amber-700")}>
              {unavailable ?? detail}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FreshnessBanner({
  status,
  lagSeconds,
  lastProjectedEventAt,
}: Readonly<{
  status: "FRESH" | "STALE" | "UNAVAILABLE";
  lagSeconds: number | null;
  lastProjectedEventAt: string | null;
}>) {
  const config = {
    FRESH: {
      label: "داده گزارش به‌روز است",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
      icon: CheckCircle2,
    },
    STALE: {
      label: "داده گزارش با تأخیر به‌روزرسانی شده است",
      className: "border-amber-200 bg-amber-50 text-amber-800",
      icon: Clock3,
    },
    UNAVAILABLE: {
      label: "انتشار شاخص‌ها به‌دلیل وضعیت Projection متوقف است",
      className: "border-red-200 bg-red-50 text-red-800",
      icon: AlertTriangle,
    },
  }[status];
  const Icon = config.icon;
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3 text-sm", config.className)} role="status">
      <Icon className="h-4 w-4" />
      <span className="font-medium">{config.label}</span>
      <span className="opacity-80">
        آخرین رویداد: {formatDateTime(lastProjectedEventAt)}
        {lagSeconds !== null ? ` · تأخیر ${formatNumber(lagSeconds)} ثانیه` : ""}
      </span>
    </div>
  );
}

function DataQualityRow({
  name,
  eligible,
  excluded,
  missing,
  legacy,
}: Readonly<{
  name: string;
  eligible: number;
  excluded: number;
  missing: number;
  legacy: number;
}>) {
  return (
    <TableRow>
      <TableCell className="font-medium">{name}</TableCell>
      <TableCell>{formatNumber(eligible)}</TableCell>
      <TableCell>{formatNumber(excluded)}</TableCell>
      <TableCell>{formatNumber(missing)}</TableCell>
      <TableCell>{formatNumber(legacy)}</TableCell>
    </TableRow>
  );
}

export function ReportingDashboard({
  access,
}: Readonly<{ access: ReportingAccessCapabilities }>) {
  const initialRange = useMemo(() => createDefaultReportingRange(), []);
  const [draftRange, setDraftRange] = useState<ReportingDateRange>(initialRange);
  const [range, setRange] = useState<ReportingDateRange>(initialRange);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [draftTransaction, setDraftTransaction] = useState<ReportingTransactionFilter>({
    providerCode: DEFAULT_PROVIDER_CODE,
    transactionType: "PAYMENT",
  });
  const [transaction, setTransaction] = useState(draftTransaction);
  const [exportType, setExportType] = useState<ReportingExportType>("time-sla");
  const [selectedSignalKey, setSelectedSignalKey] = useState<string | null>(null);

  const timeSla = useTimeSlaReport(range);
  const quality = useQualityReport(range);
  const automated = useAutomatedResolutionReport(range);
  const recurring = useRecurringProblemsReport(range);
  const ticketPerTransaction = useTicketPerTransactionReport(
    range,
    transaction,
    access.reports.ticketPerTransaction
  );
  const drillDown = useRecurringProblemDrillDown(selectedSignalKey, range);
  const reportingExport = useReportingExport();

  const allQueries = [timeSla, quality, automated, recurring, ticketPerTransaction];
  const freshness = timeSla.data?.freshness ?? quality.data?.freshness ?? recurring.data?.freshness;

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    if (!draftRange.from || !draftRange.to || draftRange.from > draftRange.to) {
      setRangeError("بازه تاریخ معتبر نیست");
      return;
    }
    if (!/^[A-Z][A-Z0-9_-]{1,63}$/.test(draftTransaction.providerCode)) {
      setRangeError("کد منبع تراکنش باید با حروف بزرگ انگلیسی ثبت شود");
      return;
    }
    setRangeError(null);
    setSelectedSignalKey(null);
    setRange(draftRange);
    setTransaction(draftTransaction);
  }

  function applyPreset(days: number) {
    const next = createDefaultReportingRange(new Date(), days);
    setDraftRange(next);
    setRange(next);
    setRangeError(null);
  }

  async function refreshReports() {
    await Promise.all(allQueries.filter((query) => query.isEnabled).map((query) => query.refetch()));
    toast.success("گزارش‌ها به‌روزرسانی شدند");
  }

  async function exportReport() {
    try {
      await reportingExport.mutateAsync({ reportType: exportType, range, transaction });
      toast.success("فایل گزارش آماده شد");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ایجاد خروجی گزارش ناموفق بود");
    }
  }

  const availableExportTypes = (Object.keys(EXPORT_LABELS) as ReportingExportType[]).filter(
    (type) => type !== "ticket-per-transaction" || access.reports.ticketPerTransaction
  );
  const scopeLabel = access.scope.type === "GLOBAL"
    ? access.scope.accessMode === "AUDIT" ? "نمای ممیزی سراسری" : "نمای مدیریتی سراسری"
    : `نمای ${formatNumber(access.scope.teamIds.length)} تیم مجاز`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">داشبورد مدیریتی پشتیبانی</h1>
            <Badge variant="outline">KPI-V1</Badge>
            <Badge variant="secondary">{scopeLabel}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            پایش ۹ شاخص موفقیت پشتیبانی بر اساس داده‌های گزارش‌گیری نسخه‌دار
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={refreshReports} disabled={allQueries.some((query) => query.isFetching)}>
            <RefreshCw className={cn("ml-2 h-4 w-4", allQueries.some((query) => query.isFetching) && "animate-spin")} />
            به‌روزرسانی
          </Button>
          {access.canExport && (
            <div className="flex min-w-72 gap-2">
              <Select value={exportType} onValueChange={(value) => setExportType(value as ReportingExportType)}>
                <SelectTrigger aria-label="نوع خروجی گزارش">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableExportTypes.map((type) => (
                    <SelectItem key={type} value={type}>{EXPORT_LABELS[type]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={exportReport} disabled={reportingExport.isPending}>
                <Download className="ml-2 h-4 w-4" />
                خروجی CSV
              </Button>
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">فیلتر گزارش</CardTitle>
          <CardDescription>تاریخ پایان شامل روز انتخاب‌شده است؛ محاسبات با مرز زمانی تهران انجام می‌شود.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 lg:grid-cols-5" onSubmit={applyFilters}>
            <div className="space-y-2">
              <Label htmlFor="report-from">از تاریخ</Label>
              <PersianDatePicker id="report-from" value={draftRange.from} maxDate={draftRange.to} onChange={(value) => setDraftRange((current) => ({ ...current, from: value }))} aria-label="از تاریخ" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-to">تا تاریخ</Label>
              <PersianDatePicker id="report-to" value={draftRange.to} minDate={draftRange.from} onChange={(value) => setDraftRange((current) => ({ ...current, to: value }))} aria-label="تا تاریخ" />
            </div>
            {access.reports.ticketPerTransaction && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="report-provider">کد منبع تراکنش</Label>
                  <Input id="report-provider" dir="ltr" value={draftTransaction.providerCode} maxLength={64} onChange={(event) => setDraftTransaction((current) => ({ ...current, providerCode: event.target.value.trim().toUpperCase() }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="report-transaction-type">نوع تراکنش</Label>
                  <Select value={draftTransaction.transactionType} onValueChange={(value) => setDraftTransaction((current) => ({ ...current, transactionType: value as ReportingTransactionFilter["transactionType"] }))}>
                    <SelectTrigger id="report-transaction-type" aria-label="نوع تراکنش"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TRANSACTION_TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="flex items-end gap-2 mb-2">
              <Button type="submit" className="flex-1"><Search className="ml-2 h-4 w-4" />اعمال فیلتر</Button>
            </div>
            <div className="flex flex-wrap gap-2 lg:col-span-5">
              {[7, 30, 90].map((days) => (
                <Button key={days} type="button" variant="outline" size="sm" onClick={() => applyPreset(days)}>
                  {formatNumber(days)} روز کامل اخیر
                </Button>
              ))}
              <span className="self-center text-xs text-muted-foreground">بازه فعال: {formatReportingRange(range)}</span>
            </div>
            {rangeError && <p className="text-sm text-destructive lg:col-span-5" role="alert">{rangeError}</p>}
          </form>
        </CardContent>
      </Card>

      {freshness && (
        <FreshnessBanner
          status={freshness.status}
          lagSeconds={freshness.projectionLagSeconds}
          lastProjectedEventAt={freshness.lastProjectedEventAt}
        />
      )}

      <section aria-labelledby="kpi-overview-title" className="space-y-3">
        <div>
          <h2 id="kpi-overview-title" className="text-lg font-semibold">نمای کلی شاخص‌ها</h2>
          <p className="text-sm text-muted-foreground">عدد خط تیره یعنی شاخص مطابق قرارداد فعلاً قابل انتشار نیست.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard title="زمان اولین پاسخ" description="میانگین زمان مؤثر تا اولین پاسخ انسانی" icon={Clock3} loading={timeSla.isLoading} error={timeSla.error} value={formatDuration(timeSla.data?.firstResponseTime.value?.averageMilliseconds)} detail={`میانه ${formatDuration(timeSla.data?.firstResponseTime.value?.medianMilliseconds)} · ${formatNumber(timeSla.data?.firstResponseTime.sampleCount)} نمونه`} reason={timeSla.data?.firstResponseTime.reason} />
          <MetricCard title="زمان حل کامل" description="میانگین زمان مؤثر از ثبت تا حل" icon={TicketCheck} loading={timeSla.isLoading} error={timeSla.error} value={formatDuration(timeSla.data?.resolutionTime.value?.averageMilliseconds)} detail={`صدک ۹۰: ${formatDuration(timeSla.data?.resolutionTime.value?.p90Milliseconds)} · ${formatNumber(timeSla.data?.resolutionTime.sampleCount)} نمونه`} reason={timeSla.data?.resolutionTime.reason} />
          <MetricCard title="حل در اولین ارتباط" description="درخواست‌های حل‌شده بدون رفت‌وبرگشت اضافه" icon={Target} loading={quality.isLoading} error={quality.error} value={formatPercentage(quality.data?.firstContactResolution.percentage)} progress={quality.data?.firstContactResolution.percentage} detail={`${formatNumber(quality.data?.firstContactResolution.achievedCount)} موفق از ${formatNumber(quality.data?.firstContactResolution.sampleCount)} نمونه`} reason={quality.data?.firstContactResolution.reason} />
          <MetricCard title="رعایت زمان تعهد" description="رعایت هم‌زمان SLA پاسخ و حل" icon={ShieldCheck} loading={timeSla.isLoading} error={timeSla.error} value={formatPercentage(timeSla.data?.slaCompliance.combined.percentage)} progress={timeSla.data?.slaCompliance.combined.percentage} detail={`${formatNumber(timeSla.data?.slaCompliance.combined.metCount)} رعایت‌شده · ${formatNumber(timeSla.data?.slaCompliance.combined.breachedCount)} نقض‌شده`} reason={timeSla.data?.slaCompliance.combined.reason} />
          <MetricCard title="بازشدن دوباره" description="نرخ تیکت‌های بازگشایی‌شده در پنجره ۷روزه" icon={RefreshCw} loading={quality.isLoading} error={quality.error} value={formatPercentage(quality.data?.reopenRate.percentage)} progress={quality.data?.reopenRate.percentage} detail={`${formatNumber(quality.data?.reopenRate.reopenedTicketCount)} تیکت بازگشایی‌شده`} reason={quality.data?.reopenRate.reason} />
          <MetricCard title="رضایت کاربر" description="میانگین امتیاز منتشرشدنی مشتریان" icon={Star} loading={quality.isLoading} error={quality.error} value={quality.data?.customerSatisfaction.score == null ? "—" : `${formatNumber(quality.data.customerSatisfaction.score)} از ۵`} progress={quality.data?.customerSatisfaction.score == null ? null : quality.data.customerSatisfaction.score * 20} detail={`${formatNumber(quality.data?.customerSatisfaction.ratingCount)} امتیاز · مشارکت ${formatPercentage(quality.data?.customerSatisfaction.participationPercentage)}`} reason={quality.data?.customerSatisfaction.reason} />
          <MetricCard title="حل خودکار" description="Journeyهای حل‌شده بدون ورود کارشناس" icon={CheckCircle2} loading={automated.isLoading} error={automated.error} value={formatPercentage(automated.data?.automatedResolution.percentage)} progress={automated.data?.automatedResolution.percentage} detail={`${formatNumber(automated.data?.automatedResolution.confirmedAutomatedCount)} حل تأییدشده از ${formatNumber(automated.data?.automatedResolution.sampleCount)} Journey`} reason={automated.data?.automatedResolution.reason} />
          {access.reports.ticketPerTransaction ? (
          <MetricCard title="تیکت به ازای تراکنش" description="تیکت به ازای هر ۱۰۰۰ تراکنش موفق" icon={BarChart3} loading={ticketPerTransaction.isLoading} error={ticketPerTransaction.error} value={formatNumber(ticketPerTransaction.data?.ticketPerTransaction.value)} detail={`${formatNumber(ticketPerTransaction.data?.ticketPerTransaction.verifiedUniqueTicketCount)} تیکت · ${formatNumber(ticketPerTransaction.data?.ticketPerTransaction.successfulTransactionCount)} تراکنش`} reason={transaction.providerCode ? ticketPerTransaction.data?.ticketPerTransaction.reason : "برای مشاهده، کد منبع تراکنش را وارد کنید"} />
          ) : (
            <MetricCard title="تیکت به ازای تراکنش" description="تیکت به ازای هر ۱۰۰۰ تراکنش موفق" icon={BarChart3} value="—" detail="" reason="این شاخص فقط در Scope سراسری منتشر می‌شود" />
          )}
          <MetricCard title="مشکلات پرتکرار" description="سهم تیکت‌های عضو گروه‌های پرتکرار" icon={Users} loading={recurring.isLoading} error={recurring.error} value={formatPercentage(recurring.data?.recurringRate.percentage)} progress={recurring.data?.recurringRate.percentage} detail={`${formatNumber(recurring.data?.recurringRate.recurringTicketCount)} تیکت در گروه‌های پرتکرار`} reason={recurring.data?.recurringRate.reason} />
        </div>
      </section>

      <Tabs defaultValue="operations" className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="operations">SLA و کیفیت</TabsTrigger>
          <TabsTrigger value="recurring">مشکلات پرتکرار</TabsTrigger>
          <TabsTrigger value="automation">حل خودکار و تراکنش</TabsTrigger>
          <TabsTrigger value="data-quality">کیفیت داده</TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">جزئیات زمان و SLA</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>شاخص</TableHead><TableHead>مقدار</TableHead><TableHead>نمونه</TableHead></TableRow></TableHeader>
                <TableBody>
                  <TableRow><TableCell>میانه اولین پاسخ</TableCell><TableCell>{formatDuration(timeSla.data?.firstResponseTime.value?.medianMilliseconds)}</TableCell><TableCell>{formatNumber(timeSla.data?.firstResponseTime.sampleCount)}</TableCell></TableRow>
                  <TableRow><TableCell>صدک ۹۰ اولین پاسخ</TableCell><TableCell>{formatDuration(timeSla.data?.firstResponseTime.value?.p90Milliseconds)}</TableCell><TableCell>{formatNumber(timeSla.data?.firstResponseTime.sampleCount)}</TableCell></TableRow>
                  <TableRow><TableCell>میانه زمان حل</TableCell><TableCell>{formatDuration(timeSla.data?.resolutionTime.value?.medianMilliseconds)}</TableCell><TableCell>{formatNumber(timeSla.data?.resolutionTime.sampleCount)}</TableCell></TableRow>
                  <TableRow><TableCell>SLA پاسخ اول</TableCell><TableCell>{formatPercentage(timeSla.data?.slaCompliance.firstResponse.percentage)}</TableCell><TableCell>{formatNumber(timeSla.data?.slaCompliance.firstResponse.sampleCount)}</TableCell></TableRow>
                  <TableRow><TableCell>SLA حل</TableCell><TableCell>{formatPercentage(timeSla.data?.slaCompliance.resolution.percentage)}</TableCell><TableCell>{formatNumber(timeSla.data?.slaCompliance.resolution.sampleCount)}</TableCell></TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">توزیع رضایت مشتری</CardTitle><CardDescription>فقط در صورت عبور از آستانه انتشار KPI-V1 نمایش داده می‌شود.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {quality.data?.customerSatisfaction.distribution ? quality.data.customerSatisfaction.distribution.slice().reverse().map((item) => (
                <div key={item.rating} className="grid grid-cols-[3rem_1fr_4rem] items-center gap-3">
                  <span className="text-sm">{formatNumber(item.rating)} ستاره</span>
                  <Progress value={item.percentage ?? 0} className="h-2" aria-label={`${item.rating} ستاره ${item.percentage ?? 0} درصد`} />
                  <span className="text-left text-xs text-muted-foreground">{formatPercentage(item.percentage)}</span>
                </div>
              )) : <p className="text-sm text-muted-foreground">{reasonLabel(quality.data?.customerSatisfaction.reason) ?? "داده‌ای برای نمایش وجود ندارد."}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recurring" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">رتبه‌بندی موضوعات</CardTitle><CardDescription>بیشترین حجم تیکت در بازه انتخاب‌شده</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>خدمت</TableHead><TableHead>نوع درخواست</TableHead><TableHead>تعداد</TableHead><TableHead>سهم</TableHead></TableRow></TableHeader>
                <TableBody>
                  {recurring.data?.ranking.map((item) => <TableRow key={`${item.serviceCode}:${item.requestTypeCode}`}><TableCell>{item.serviceName}</TableCell><TableCell>{item.requestTypeName}</TableCell><TableCell>{formatNumber(item.count)}</TableCell><TableCell>{formatPercentage(item.sharePercentage)}</TableCell></TableRow>)}
                  {!recurring.isLoading && !recurring.data?.ranking.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">موضوعی برای رتبه‌بندی وجود ندارد.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">سیگنال‌های پرتکرار</CardTitle><CardDescription>آستانه: حداقل ۵ تیکت و ۳ مشتری متمایز در هفت روز</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>موضوع</TableHead><TableHead>علت/رخداد</TableHead><TableHead>وضعیت</TableHead><TableHead>تعداد</TableHead><TableHead>رشد</TableHead><TableHead>جزئیات</TableHead></TableRow></TableHeader>
                <TableBody>
                  {recurring.data?.groups.map((group) => <TableRow key={group.signalKey}><TableCell><span className="font-medium">{group.requestType.name}</span><span className="block text-xs text-muted-foreground">{group.service.name}</span></TableCell><TableCell>{group.normalizedRootCause?.name ?? group.incidentKey ?? "—"}</TableCell><TableCell><Badge variant={group.status === "RECURRING" ? "destructive" : group.status === "NEW_SIGNAL" ? "warning" : "outline"}>{SIGNAL_STATUS_LABELS[group.status]}</Badge></TableCell><TableCell>{formatNumber(group.ticketCount)}</TableCell><TableCell>{group.growthPercent == null ? "—" : `${group.growthPercent > 0 ? "+" : ""}${formatPercentage(group.growthPercent)}`}</TableCell><TableCell>{group.drillDownAvailable ? <Button variant="ghost" size="sm" onClick={() => setSelectedSignalKey(group.signalKey)}>مشاهده تیکت‌ها</Button> : <span className="text-xs text-muted-foreground">غیرمجاز</span>}</TableCell></TableRow>)}
                  {!recurring.isLoading && !recurring.data?.groups.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">سیگنال پرتکراری در این بازه ثبت نشده است.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation" className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">سرنوشت Journeyهای راهنما</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {[
                ["حل خودکار تأییدشده", automated.data?.automatedResolution.confirmedAutomatedCount],
                ["تبدیل‌شده به تیکت", automated.data?.automatedResolution.convertedToTicketCount],
                ["ورود کارشناس", automated.data?.automatedResolution.humanInterventionCount],
                ["نتیجه نامشخص", automated.data?.automatedResolution.unknownOutcomeCount],
              ].map(([label, value]) => <div key={String(label)} className="rounded-lg border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{formatNumber(value as number | undefined)}</p></div>)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">پوشش حجم تراکنش</CardTitle><CardDescription>تنها سطل‌های روزانه VERIFIED وارد مخرج می‌شوند.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {access.reports.ticketPerTransaction ? <>
                <div className="flex justify-between text-sm"><span>سطل مورد انتظار</span><strong>{formatNumber(ticketPerTransaction.data?.dataQuality.expectedBucketCount)}</strong></div>
                <div className="flex justify-between text-sm"><span>سطل تأییدشده</span><strong>{formatNumber(ticketPerTransaction.data?.dataQuality.verifiedBucketCount)}</strong></div>
                <div className="flex justify-between text-sm"><span>سطل مفقود</span><strong>{formatNumber(ticketPerTransaction.data?.dataQuality.missingBucketCount)}</strong></div>
                <Progress value={ticketPerTransaction.data?.dataQuality.expectedBucketCount ? (ticketPerTransaction.data.dataQuality.verifiedBucketCount / ticketPerTransaction.data.dataQuality.expectedBucketCount) * 100 : 0} className="h-2" aria-label="درصد پوشش حجم تراکنش" />
              </> : <p className="text-sm text-muted-foreground">برای Scope تیمی منتشر نمی‌شود.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data-quality">
          <Card>
            <CardHeader><CardTitle className="text-base">کنترل کیفیت داده‌های گزارش</CardTitle><CardDescription>رکوردهای ناقص یا Legacy از KPI اصلی حذف می‌شوند.</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>منبع شاخص</TableHead><TableHead>واجد شرایط</TableHead><TableHead>حذف‌شده</TableHead><TableHead>بعد/رویداد ناقص</TableHead><TableHead>Legacy</TableHead></TableRow></TableHeader>
                <TableBody>
                  {timeSla.data && <DataQualityRow name="زمان و SLA" eligible={timeSla.data.dataQuality.eligibleCount} excluded={timeSla.data.dataQuality.excludedCount} missing={timeSla.data.dataQuality.missingEventCount + timeSla.data.dataQuality.missingDimensionCount} legacy={timeSla.data.dataQuality.legacyCount} />}
                  {quality.data && <DataQualityRow name="FCR، بازگشایی و رضایت" eligible={quality.data.dataQuality.eligibleCount} excluded={quality.data.dataQuality.excludedCount} missing={quality.data.dataQuality.missingEventCount + quality.data.dataQuality.missingDimensionCount} legacy={quality.data.dataQuality.legacyCount} />}
                  {automated.data && <DataQualityRow name="حل خودکار" eligible={automated.data.dataQuality.eligibleCount} excluded={automated.data.dataQuality.excludedCount} missing={automated.data.dataQuality.missingEventCount + automated.data.dataQuality.missingDimensionCount} legacy={automated.data.dataQuality.legacyCount} />}
                  {recurring.data && <DataQualityRow name="مشکلات پرتکرار" eligible={recurring.data.dataQuality.eligibleCount} excluded={recurring.data.dataQuality.excludedCount} missing={recurring.data.dataQuality.missingDimensionCount} legacy={recurring.data.dataQuality.legacyCount} />}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={selectedSignalKey !== null} onOpenChange={(open) => !open && setSelectedSignalKey(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تیکت‌های مرتبط با سیگنال</DialogTitle>
            <DialogDescription>فقط تیکت‌هایی نمایش داده می‌شوند که مجوز عادی مشاهده آن‌ها را دارید.</DialogDescription>
          </DialogHeader>
          {drillDown.isLoading && <p role="status">در حال دریافت تیکت‌ها…</p>}
          {drillDown.error && <p role="alert" className="text-sm text-destructive">{drillDown.error.message}</p>}
          <div className="divide-y rounded-lg border">
            {drillDown.data?.tickets.map((ticket) => (
              <Link key={ticket.ticketId} href={`/admin/tickets/${ticket.ticketId}`} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50">
                <div className="min-w-0"><p className="truncate font-medium">{ticket.subject}</p><p className="text-xs text-muted-foreground">{ticket.ticketId} · {formatDateTime(ticket.createdAt)}</p></div>
                <Badge variant="outline">{ticket.lifecycleStatus}</Badge>
              </Link>
            ))}
            {drillDown.data && drillDown.data.tickets.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">تیکت قابل مشاهده‌ای وجود ندارد.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
