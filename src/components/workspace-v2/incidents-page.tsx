"use client";

import { useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIncidentCommands, useWorkspaceIncidents } from "@/hooks/support-incidents";
import { formatJalaliDateTime } from "@/lib/jalali-date";
import type { SupportIncident, SupportIncidentSeverity } from "@/types/support-incident";

const statusLabel = { DETECTED: "شناسایی‌شده", INVESTIGATING: "در حال بررسی", MITIGATED: "مهار شده", RESOLVED: "رفع شده", CLOSED: "بسته" } as const;
const severityLabel = { LOW: "کم", MEDIUM: "متوسط", HIGH: "زیاد", CRITICAL: "بحرانی" } as const;

function IncidentActions({ incident }: Readonly<{ incident: SupportIncident }>) {
  const commands = useIncidentCommands();
  const [notice, setNotice] = useState(incident.initialNotice ?? "");
  const [resolution, setResolution] = useState(incident.resolutionSummary ?? "");
  if (["RESOLVED", "CLOSED"].includes(incident.status)) return null;
  return (
    <div className="grid gap-4 border-t pt-4 lg:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`notice-${incident.id}`}>پیام اولیه برای کاربران</Label>
        <Textarea id={`notice-${incident.id}`} value={notice} onChange={(event) => setNotice(event.target.value)} maxLength={2000} rows={3} />
        <Button size="sm" variant="outline" disabled={!notice.trim() || commands.notify.isPending} onClick={() => commands.notify.mutate({ incidentKey: incident.incidentKey, message: notice.trim() })}>
          <BellRing className="ml-2 h-4 w-4" /> اطلاع‌رسانی به همه
        </Button>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`resolution-${incident.id}`}>نتیجه رفع علت مشترک</Label>
        <Textarea id={`resolution-${incident.id}`} value={resolution} onChange={(event) => setResolution(event.target.value)} maxLength={5000} rows={3} />
        <Button size="sm" disabled={!resolution.trim() || commands.resolve.isPending} onClick={() => commands.resolve.mutate({ incidentKey: incident.incidentKey, resolutionSummary: resolution.trim() })}>
          <CheckCircle2 className="ml-2 h-4 w-4" /> ثبت رفع رخداد
        </Button>
      </div>
    </div>
  );
}

export function IncidentsPage() {
  const incidents = useWorkspaceIncidents();
  const commands = useIncidentCommands();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<SupportIncidentSeverity>("HIGH");
  const [ticketIds, setTicketIds] = useState("");
  const error = incidents.error?.message ?? commands.create.error?.message ?? commands.notify.error?.message ?? commands.resolve.error?.message;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">رخدادهای عمومی</h1>
        <p className="text-muted-foreground">یک علت مشترک را یک‌بار مدیریت کنید و همه کاربران تحت تأثیر را هماهنگ نگه دارید.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> ثبت رخداد جدید</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="incident-title">عنوان</Label><Input id="incident-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} /></div>
          <div className="space-y-2"><Label htmlFor="incident-severity">شدت</Label><select id="incident-severity" className="h-10 w-full rounded-md border bg-background px-3" value={severity} onChange={(event) => setSeverity(event.target.value as SupportIncidentSeverity)}>{Object.entries(severityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="incident-description">شرح نشانه و دامنه اثر</Label><Textarea id="incident-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} /></div>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="incident-tickets">شناسه تیکت‌های تحت تأثیر</Label><Input id="incident-tickets" dir="ltr" value={ticketIds} onChange={(event) => setTicketIds(event.target.value)} placeholder="TK-... , TK-..." /><p className="text-xs text-muted-foreground">مخاطبان از روی تیکت‌ها شناسایی می‌شوند؛ شناسه‌ها را با ویرگول جدا کنید.</p></div>
          <div className="md:col-span-2"><Button disabled={!title.trim() || !description.trim() || !ticketIds.trim() || commands.create.isPending} onClick={() => commands.create.mutate({ title: title.trim(), description: description.trim(), severity, impactedPartyIds: [], linkedTicketIds: ticketIds.split(",").map((item) => item.trim()).filter(Boolean) }, { onSuccess: () => { setTitle(""); setDescription(""); setTicketIds(""); } })}><AlertTriangle className="ml-2 h-4 w-4" /> ایجاد رخداد اصلی</Button></div>
        </CardContent>
      </Card>
      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
      <div className="space-y-4">
        {incidents.isLoading && <p className="text-muted-foreground">در حال دریافت رخدادها…</p>}
        {incidents.data?.map((incident) => (
          <Card key={incident.incidentKey}>
            <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{incident.title}</CardTitle><p className="mt-1 font-mono text-xs text-muted-foreground">{incident.incidentKey}</p></div><div className="flex gap-2"><Badge variant="outline">{severityLabel[incident.severity]}</Badge><Badge>{statusLabel[incident.status]}</Badge></div></div></CardHeader>
            <CardContent className="space-y-4"><p className="whitespace-pre-wrap text-sm">{incident.description}</p><div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span>{formatJalaliDateTime(incident.detectedAt)}</span><span>{incident.impacts.length} مخاطب</span><span>{incident.ticketLinks.length} تیکت مرتبط</span></div>{incident.initialNotice && <div className="rounded-lg border bg-muted/30 p-3 text-sm"><strong>اطلاعیه:</strong> {incident.initialNotice}</div>}{incident.resolutionSummary && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"><strong>نتیجه رفع:</strong> {incident.resolutionSummary}</div>}<IncidentActions incident={incident} /></CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
