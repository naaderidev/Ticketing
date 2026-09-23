"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Archive, BookOpenCheck, FilePenLine, Plus, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useArchiveWorkspaceKnowledgeArticle,
  useCreateWorkspaceKnowledgeArticle,
  usePublishWorkspaceKnowledgeArticle,
  useSupportManagementSnapshot,
  useUpdateWorkspaceKnowledgeArticle,
  useWorkspaceKnowledgeArticles,
} from "@/hooks";
import { toPersianDigits } from "@/lib/format";
import type {
  KnowledgeAudience,
  WorkspaceKnowledgeArticle,
} from "@/types/workspace-knowledge";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const statusLabels = {
  DRAFT: "پیش‌نویس",
  ACTIVE: "منتشرشده",
  ARCHIVED: "بایگانی‌شده",
} as const;

const audienceLabels = {
  PUBLIC: "عمومی و قابل پیشنهاد خودکار",
  AUTHENTICATED: "کاربران واردشده",
  ORGANIZATION: "کاربران سازمانی",
} as const;

function splitKeywords(value: string): string[] {
  return [...new Set(value.split(/[،,\n]/).map((item) => item.trim()).filter(Boolean))];
}

function notifyError(error: Error) {
  toast.error(error.message);
}

export function KnowledgeManager() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const articles = useWorkspaceKnowledgeArticles(deferredSearch);
  const catalog = useSupportManagementSnapshot();
  const createArticle = useCreateWorkspaceKnowledgeArticle();
  const updateArticle = useUpdateWorkspaceKnowledgeArticle();
  const publishArticle = usePublishWorkspaceKnowledgeArticle();
  const archiveArticle = useArchiveWorkspaceKnowledgeArticle();

  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [keywords, setKeywords] = useState("");
  const [audience, setAudience] = useState<KnowledgeAudience>("PUBLIC");
  const [serviceId, setServiceId] = useState("");
  const [requestTypeId, setRequestTypeId] = useState("");

  const services = useMemo(
    () => catalog.data?.services ?? [],
    [catalog.data?.services]
  );
  const requestTypes = useMemo(
    () =>
      services
        .filter((service) => !serviceId || service.id === Number(serviceId))
        .flatMap((service) =>
          service.requestTypes.map((requestType) => ({ ...requestType, service }))
        ),
    [serviceId, services]
  );
  const selectedArticle = articles.data?.find(
    (article) => article.id === selectedArticleId
  );
  const isSaving = createArticle.isPending || updateArticle.isPending;

  function resetForm() {
    setSelectedArticleId(null);
    setSlug("");
    setTitle("");
    setBody("");
    setKeywords("");
    setAudience("PUBLIC");
    setServiceId("");
    setRequestTypeId("");
  }

  function editArticle(article: WorkspaceKnowledgeArticle) {
    setSelectedArticleId(article.id);
    setSlug(article.slug);
    setTitle(article.version?.title ?? article.publishedVersion?.title ?? "");
    setBody(article.version?.body ?? article.publishedVersion?.body ?? "");
    setKeywords(article.keywords.join("، "));
    setAudience(article.audience);
    setServiceId(article.serviceId ? String(article.serviceId) : "");
    setRequestTypeId(article.requestTypeId ? String(article.requestTypeId) : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function draftCommand() {
    return {
      title: title.trim(),
      body: body.trim(),
      keywords: splitKeywords(keywords),
      audience,
      ...(serviceId ? { serviceId: Number(serviceId) } : {}),
      ...(requestTypeId ? { requestTypeId: Number(requestTypeId) } : {}),
    };
  }

  function saveDraft() {
    if (!title.trim() || body.trim().length < 10) {
      toast.error("عنوان و متن کامل راهنما را وارد کنید");
      return;
    }
    if (audience === "PUBLIC" && !requestTypeId) {
      toast.error("راهنمای عمومی باید به نوع درخواست متصل باشد");
      return;
    }
    if (selectedArticleId) {
      updateArticle.mutate(
        { articleId: selectedArticleId, command: draftCommand() },
        {
          onSuccess: (article) => {
            toast.success(`پیش‌نویس نسخه ${toPersianDigits(article.version?.version ?? 1)} ذخیره شد`);
            resetForm();
          },
          onError: notifyError,
        }
      );
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      toast.error("نامک را با حروف انگلیسی کوچک و خط تیره وارد کنید");
      return;
    }
    createArticle.mutate(
      { slug, ...draftCommand() },
      {
        onSuccess: () => {
          toast.success("مقاله دانش ایجاد شد و برای انتشار آماده است");
          resetForm();
        },
        onError: notifyError,
      }
    );
  }

  function publish(article: WorkspaceKnowledgeArticle) {
    if (!article.version || article.version.approvalStatus !== "DRAFT") return;
    publishArticle.mutate(
      { articleId: article.id, version: article.version.version },
      {
        onSuccess: () => toast.success("نسخه تأیید و منتشر شد"),
        onError: notifyError,
      }
    );
  }

  function archive(article: WorkspaceKnowledgeArticle) {
    archiveArticle.mutate(article.id, {
      onSuccess: () => {
        toast.success("مقاله بایگانی شد و دیگر به مشتری پیشنهاد نمی‌شود");
        if (selectedArticleId === article.id) resetForm();
      },
      onError: notifyError,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">مدیریت دانش و پاسخ خودکار</h1>
        <p className="text-muted-foreground">
          راهنماهای تأییدشده، کلیدواژه‌های تشخیص موضوع و اتصال به مسیر تیکت را مدیریت کنید.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              {selectedArticle ? <FilePenLine className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {selectedArticle ? `ویرایش ${selectedArticle.slug}` : "ایجاد راهنمای جدید"}
            </CardTitle>
            {selectedArticle && <Button variant="outline" onClick={resetForm}>انصراف از ویرایش</Button>}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="knowledge-slug">نامک انگلیسی</Label>
            <Input id="knowledge-slug" dir="ltr" value={slug} disabled={Boolean(selectedArticle)} maxLength={191} onChange={(event) => setSlug(event.target.value.toLowerCase())} placeholder="payment-status-help" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="knowledge-audience">مخاطب</Label>
            <select id="knowledge-audience" className={selectClass} value={audience} onChange={(event) => setAudience(event.target.value as KnowledgeAudience)}>
              {Object.entries(audienceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="knowledge-service">خدمت</Label>
            <select id="knowledge-service" className={selectClass} value={serviceId} onChange={(event) => { setServiceId(event.target.value); setRequestTypeId(""); }}>
              <option value="">بدون خدمت</option>
              {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="knowledge-request-type">نوع درخواست مقصد</Label>
            <select id="knowledge-request-type" className={selectClass} value={requestTypeId} onChange={(event) => { setRequestTypeId(event.target.value); const item = requestTypes.find((requestType) => requestType.id === Number(event.target.value)); if (item) setServiceId(String(item.service.id)); }}>
              <option value="">بدون نوع درخواست</option>
              {requestTypes.map((item) => <option key={item.id} value={item.id}>{item.service.name} / {item.name}</option>)}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="knowledge-title">عنوان راهنما</Label>
            <Input id="knowledge-title" value={title} maxLength={500} onChange={(event) => setTitle(event.target.value)} placeholder="مثلاً وضعیت پرداخت را چگونه پیگیری کنم؟" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="knowledge-keywords">کلیدواژه‌ها و مترادف‌ها</Label>
            <Textarea id="knowledge-keywords" value={keywords} maxLength={1000} rows={3} onChange={(event) => setKeywords(event.target.value)} placeholder="پرداخت، تراکنش، واریز، درگاه" />
            <p className="text-xs text-muted-foreground">هر کلیدواژه را با ویرگول یا خط جدید جدا کنید؛ حداکثر ۳۰ مورد.</p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="knowledge-body">پاسخ تأییدشده</Label>
            <Textarea id="knowledge-body" value={body} maxLength={20_000} rows={9} onChange={(event) => setBody(event.target.value)} placeholder="پاسخی بنویسید که بدون حدس‌زدن اطلاعات مالی یا قراردادی، مسیر امن بعدی را به کاربر توضیح دهد." />
          </div>
          <Button className="md:col-span-2" onClick={saveDraft} disabled={isSaving || catalog.isLoading}>
            <BookOpenCheck className="ml-2 h-4 w-4" />
            {isSaving ? "در حال ذخیره…" : "ذخیره پیش‌نویس"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">راهنماهای موجود</CardTitle>
            <div className="relative w-full sm:w-80">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pr-9" placeholder="جست‌وجوی عنوان، نامک یا کلیدواژه" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {articles.isLoading && <p className="text-muted-foreground">در حال دریافت راهنماها…</p>}
          {articles.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{articles.error.message}</p>}
          {articles.data?.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">راهنمایی پیدا نشد.</p>}
          {articles.data?.map((article) => (
            <div key={article.id} className="rounded-xl border p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{article.version?.title ?? article.publishedVersion?.title ?? article.slug}</h3>
                    <Badge variant={article.status === "ARCHIVED" ? "closed" : article.status === "ACTIVE" ? "open" : "secondary"}>{statusLabels[article.status]}</Badge>
                    <Badge variant="outline">نسخه {toPersianDigits(article.version?.version ?? 1)}</Badge>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground" dir="ltr">{article.slug}</p>
                  <p className="text-sm text-muted-foreground">
                    {article.service?.name ?? "بدون خدمت"} / {article.requestType?.name ?? "بدون نوع درخواست"}
                  </p>
                  {article.keywords.length > 0 && <p className="line-clamp-1 text-xs text-muted-foreground">کلیدواژه‌ها: {article.keywords.join("، ")}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {article.status !== "ARCHIVED" && <Button variant="outline" onClick={() => editArticle(article)}><FilePenLine className="ml-2 h-4 w-4" />ویرایش</Button>}
                  {article.status !== "ARCHIVED" && article.version?.approvalStatus === "DRAFT" && <Button onClick={() => publish(article)} disabled={publishArticle.isPending}><Send className="ml-2 h-4 w-4" />تأیید و انتشار</Button>}
                  {article.status !== "ARCHIVED" && <Button variant="destructive" onClick={() => archive(article)} disabled={archiveArticle.isPending}><Archive className="ml-2 h-4 w-4" />بایگانی</Button>}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
