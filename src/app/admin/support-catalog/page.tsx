"use client";

import { useMemo, useState } from "react";
import { Database, Layers3, Route, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  type LegacySupportCatalogMapping,
  type SupportPriority,
  useAssignSupportTeamMember,
  useCreateSupportRequestType,
  useCreateSupportService,
  useCreateSupportTeam,
  usePublishSupportRoute,
  useReconcileLegacySupportMapping,
  useSupportManagementSnapshot,
  useSupportTeamMemberCandidates,
} from "@/hooks";
import { toPersianDigits } from "@/lib/format";

const selectClass =
  "h-10 w-full rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50";
const priorities: SupportPriority[] = ["CRITICAL", "HIGH", "NORMAL", "LOW"];
const priorityLabels: Record<SupportPriority, string> = {
  CRITICAL: "بحرانی",
  HIGH: "بالا",
  NORMAL: "عادی",
  LOW: "کم",
};

function asPositiveInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function notifyMutationError(error: Error) {
  toast.error(error.message);
}

function legacyLabel(mapping: LegacySupportCatalogMapping) {
  if (mapping.sourceType === "DEPARTMENT") {
    return mapping.department?.name ?? `Department #${mapping.legacyId}`;
  }
  return mapping.subDepartment
    ? `${mapping.subDepartment.department.name} / ${mapping.subDepartment.name}`
    : `SubDepartment #${mapping.legacyId}`;
}

export default function SupportCatalogPage() {
  const snapshot = useSupportManagementSnapshot();
  const memberCandidates = useSupportTeamMemberCandidates();
  const users = memberCandidates.data ?? [];
  const createService = useCreateSupportService();
  const createTeam = useCreateSupportTeam();
  const createRequestType = useCreateSupportRequestType();
  const assignMember = useAssignSupportTeamMember();
  const publishRoute = usePublishSupportRoute();
  const reconcileMapping = useReconcileLegacySupportMapping();

  const [serviceCode, setServiceCode] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [teamName, setTeamName] = useState("");
  const [queueCode, setQueueCode] = useState("");
  const [queueName, setQueueName] = useState("");
  const [requestServiceId, setRequestServiceId] = useState("");
  const [requestCode, setRequestCode] = useState("");
  const [requestName, setRequestName] = useState("");
  const [requestQueueId, setRequestQueueId] = useState("");
  const [requestPriority, setRequestPriority] =
    useState<SupportPriority>("NORMAL");
  const [businessSubjectType, setBusinessSubjectType] = useState("");
  const [requiresBusinessSubject, setRequiresBusinessSubject] = useState(false);
  const [requiresRootCause, setRequiresRootCause] = useState(false);
  const [memberTeamId, setMemberTeamId] = useState("");
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState<"SUPPORT_AGENT" | "SUPERVISOR">(
    "SUPPORT_AGENT"
  );
  const [routeRequestTypeId, setRouteRequestTypeId] = useState("");
  const [routeQueueId, setRouteQueueId] = useState("");
  const [routePriority, setRoutePriority] =
    useState<SupportPriority>("NORMAL");
  const [routeReason, setRouteReason] = useState("");
  const [mappingId, setMappingId] = useState("");
  const [mappingTargetId, setMappingTargetId] = useState("");

  const services = useMemo(
    () => snapshot.data?.services ?? [],
    [snapshot.data?.services]
  );
  const teams = useMemo(
    () => snapshot.data?.teams ?? [],
    [snapshot.data?.teams]
  );
  const queues = useMemo(
    () => teams.flatMap((team) => team.queues.map((queue) => ({ ...queue, team }))),
    [teams]
  );
  const requestTypes = useMemo(
    () =>
      services.flatMap((service) =>
        service.requestTypes.map((requestType) => ({ ...requestType, service }))
      ),
    [services]
  );
  const pendingMappings = (snapshot.data?.legacyMappings ?? []).filter(
    (mapping) => mapping.status === "PENDING" || mapping.status === "CONFLICT"
  );
  const selectedMapping = pendingMappings.find(
    (mapping) => mapping.id === asPositiveInteger(mappingId)
  );

  const submitService = () => {
    if (!serviceCode.trim() || !serviceName.trim()) {
      toast.error("کد و نام خدمت را کامل کنید");
      return;
    }
    createService.mutate(
      { code: serviceCode.trim().toUpperCase(), name: serviceName.trim(), sortOrder: 0 },
      {
        onSuccess: () => {
          toast.success("خدمت ایجاد شد");
          setServiceCode("");
          setServiceName("");
        },
        onError: notifyMutationError,
      }
    );
  };

  const submitTeam = () => {
    if (![teamCode, teamName, queueCode, queueName].every((value) => value.trim())) {
      toast.error("اطلاعات تیم و صف پیش‌فرض را کامل کنید");
      return;
    }
    createTeam.mutate(
      {
        code: teamCode.trim().toUpperCase(),
        name: teamName.trim(),
        defaultQueue: {
          code: queueCode.trim().toUpperCase(),
          name: queueName.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success("تیم و صف پیش‌فرض ایجاد شدند");
          setTeamCode("");
          setTeamName("");
          setQueueCode("");
          setQueueName("");
        },
        onError: notifyMutationError,
      }
    );
  };

  const submitRequestType = () => {
    const serviceId = asPositiveInteger(requestServiceId);
    const queueId = asPositiveInteger(requestQueueId);
    if (!serviceId || !queueId || !requestCode.trim() || !requestName.trim()) {
      toast.error("خدمت، صف، کد و نام نوع درخواست را کامل کنید");
      return;
    }
    createRequestType.mutate(
      {
        serviceId,
        queueId,
        code: requestCode.trim().toUpperCase(),
        name: requestName.trim(),
        businessSubjectType: businessSubjectType.trim().toUpperCase() || undefined,
        requiresBusinessSubject,
        requiresRootCause,
        sortOrder: 0,
        defaultPriority: requestPriority,
      },
      {
        onSuccess: () => {
          toast.success("نوع درخواست و نسخه نخست مسیر ایجاد شدند");
          setRequestCode("");
          setRequestName("");
          setBusinessSubjectType("");
        },
        onError: notifyMutationError,
      }
    );
  };

  const submitMember = () => {
    const teamId = asPositiveInteger(memberTeamId);
    const userId = asPositiveInteger(memberUserId);
    if (!teamId || !userId) return toast.error("تیم و کاربر را انتخاب کنید");
    assignMember.mutate(
      { teamId, userId, roleKey: memberRole },
      {
        onSuccess: () => toast.success("عضویت تیم ثبت شد"),
        onError: notifyMutationError,
      }
    );
  };

  const submitRoute = () => {
    const requestTypeId = asPositiveInteger(routeRequestTypeId);
    const queueId = asPositiveInteger(routeQueueId);
    if (!requestTypeId || !queueId || routeReason.trim().length < 5) {
      toast.error("نوع درخواست، صف و دلیل تغییر را کامل کنید");
      return;
    }
    publishRoute.mutate(
      { requestTypeId, queueId, defaultPriority: routePriority, reason: routeReason.trim() },
      {
        onSuccess: () => {
          toast.success("نسخه جدید مسیر منتشر شد");
          setRouteReason("");
        },
        onError: notifyMutationError,
      }
    );
  };

  const submitMapping = (status: "MAPPED" | "IGNORED" | "CONFLICT") => {
    const id = asPositiveInteger(mappingId);
    if (!id || !selectedMapping) return toast.error("رکورد legacy را انتخاب کنید");
    const targetId = asPositiveInteger(mappingTargetId);
    if (status === "MAPPED" && !targetId) return toast.error("مقصد نگاشت را انتخاب کنید");
    reconcileMapping.mutate(
      {
        mappingId: id,
        status,
        ...(selectedMapping.sourceType === "DEPARTMENT"
          ? { supportServiceId: targetId ?? undefined }
          : { supportRequestTypeId: targetId ?? undefined }),
      },
      {
        onSuccess: () => {
          toast.success("نتیجه تطبیق ثبت شد");
          setMappingId("");
          setMappingTargetId("");
        },
        onError: notifyMutationError,
      }
    );
  };

  if (snapshot.isLoading) return <p>در حال دریافت کاتالوگ پشتیبانی...</p>;
  if (snapshot.isError) {
    return <p className="text-destructive">{snapshot.error.message}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">کاتالوگ و ساختار پشتیبانی</h1>
        <p className="text-muted-foreground">
          مدیریت نسخه‌دار خدمات، نوع درخواست، تیم، صف و تطبیق کنترل‌شده داده قدیمی
        </p>
      </div>
      <h2 className="sr-only">مدیریت اجزای کاتالوگ پشتیبانی</h2>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><b>{toPersianDigits(services.length)}</b> خدمت کلان</CardContent></Card>
        <Card><CardContent className="pt-6"><b>{toPersianDigits(requestTypes.length)}</b> نوع درخواست</CardContent></Card>
        <Card><CardContent className="pt-6"><b>{toPersianDigits(teams.length)}</b> تیم و <b>{toPersianDigits(queues.length)}</b> صف</CardContent></Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex gap-2 text-lg"><Layers3 className="h-5 w-5" />ایجاد خدمت کلان</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="service-code">کد انگلیسی</Label><Input id="service-code" dir="ltr" value={serviceCode} onChange={(event) => setServiceCode(event.target.value)} /></div>
            <div><Label htmlFor="service-name">نام خدمت</Label><Input id="service-name" value={serviceName} onChange={(event) => setServiceName(event.target.value)} /></div>
            <Button className="sm:col-span-2" onClick={submitService} disabled={createService.isPending}>ایجاد خدمت</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex gap-2 text-lg"><UsersRound className="h-5 w-5" />ایجاد تیم و صف پیش‌فرض</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="team-code">کد تیم</Label><Input id="team-code" dir="ltr" value={teamCode} onChange={(event) => setTeamCode(event.target.value)} /></div>
            <div><Label htmlFor="team-name">نام تیم</Label><Input id="team-name" value={teamName} onChange={(event) => setTeamName(event.target.value)} /></div>
            <div><Label htmlFor="queue-code">کد صف</Label><Input id="queue-code" dir="ltr" value={queueCode} onChange={(event) => setQueueCode(event.target.value)} /></div>
            <div><Label htmlFor="queue-name">نام صف</Label><Input id="queue-name" value={queueName} onChange={(event) => setQueueName(event.target.value)} /></div>
            <Button className="sm:col-span-2" onClick={submitTeam} disabled={createTeam.isPending}>ایجاد تیم و صف</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">ایجاد نوع درخواست و مسیر اولیه</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div><Label htmlFor="request-service">خدمت</Label><select id="request-service" className={selectClass} value={requestServiceId} onChange={(event) => setRequestServiceId(event.target.value)}><option value="">انتخاب</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></div>
          <div><Label htmlFor="request-code">کد</Label><Input id="request-code" dir="ltr" value={requestCode} onChange={(event) => setRequestCode(event.target.value)} /></div>
          <div><Label htmlFor="request-name">نام</Label><Input id="request-name" value={requestName} onChange={(event) => setRequestName(event.target.value)} /></div>
          <div><Label htmlFor="request-queue">صف مقصد</Label><select id="request-queue" className={selectClass} value={requestQueueId} onChange={(event) => setRequestQueueId(event.target.value)}><option value="">انتخاب</option>{queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.team.name} / {queue.name}</option>)}</select></div>
          <div><Label htmlFor="request-priority">اولویت پیش‌فرض</Label><select id="request-priority" className={selectClass} value={requestPriority} onChange={(event) => setRequestPriority(event.target.value as SupportPriority)}>{priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}</select></div>
          <div><Label htmlFor="business-subject">نوع موضوع کسب‌وکار (اختیاری)</Label><Input id="business-subject" dir="ltr" value={businessSubjectType} onChange={(event) => setBusinessSubjectType(event.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={requiresBusinessSubject} onChange={(event) => setRequiresBusinessSubject(event.target.checked)} />موضوع کسب‌وکار الزامی است</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={requiresRootCause} onChange={(event) => setRequiresRootCause(event.target.checked)} />علت ریشه‌ای الزامی است</label>
          <Button onClick={submitRequestType} disabled={createRequestType.isPending}>ایجاد نوع درخواست</Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">تخصیص عضو به تیم</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <select aria-label="تیم پشتیبانی" className={selectClass} value={memberTeamId} onChange={(event) => setMemberTeamId(event.target.value)}><option value="">تیم</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
            <select aria-label="کاربر" className={selectClass} value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)} disabled={memberCandidates.isLoading || memberCandidates.isError}><option value="">{memberCandidates.isLoading ? "در حال دریافت کاربران..." : "کاربر"}</option>{users.map((user) => <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>)}</select>
            <select aria-label="نقش تیم" className={selectClass} value={memberRole} onChange={(event) => setMemberRole(event.target.value as typeof memberRole)}><option value="SUPPORT_AGENT">کارشناس</option><option value="SUPERVISOR">سرپرست</option></select>
            <Button className="sm:col-span-3" onClick={submitMember} disabled={assignMember.isPending}>ثبت عضویت</Button>
            {memberCandidates.isError ? <p className="text-sm text-destructive sm:col-span-3">{memberCandidates.error.message}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex gap-2 text-lg"><Route className="h-5 w-5" />انتشار نسخه جدید مسیر</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <select aria-label="نوع درخواست مسیر" className={selectClass} value={routeRequestTypeId} onChange={(event) => setRouteRequestTypeId(event.target.value)}><option value="">نوع درخواست</option>{requestTypes.map((item) => <option key={item.id} value={item.id}>{item.service.name} / {item.name}</option>)}</select>
            <select aria-label="صف مقصد مسیر" className={selectClass} value={routeQueueId} onChange={(event) => setRouteQueueId(event.target.value)}><option value="">صف جدید</option>{queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.team.name} / {queue.name}</option>)}</select>
            <select aria-label="اولویت مسیر" className={selectClass} value={routePriority} onChange={(event) => setRoutePriority(event.target.value as SupportPriority)}>{priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}</select>
            <Textarea aria-label="دلیل تغییر مسیر" placeholder="دلیل تغییر مسیر" value={routeReason} onChange={(event) => setRouteReason(event.target.value)} maxLength={500} />
            <Button className="sm:col-span-2" onClick={submitRoute} disabled={publishRoute.isPending}>انتشار مسیر</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex gap-2 text-lg"><Database className="h-5 w-5" />تطبیق دستی داده قدیمی</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">هیچ نگاشتی بر اساس تشابه نام به‌صورت خودکار انجام نمی‌شود. مقصد هر رکورد را بازبین انتخاب می‌کند.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <select aria-label="رکورد قدیمی" className={selectClass} value={mappingId} onChange={(event) => { setMappingId(event.target.value); setMappingTargetId(""); }}><option value="">رکورد در انتظار ({toPersianDigits(pendingMappings.length)})</option>{pendingMappings.map((mapping) => <option key={mapping.id} value={mapping.id}>{mapping.sourceType === "DEPARTMENT" ? "دپارتمان" : "زیردپارتمان"}: {legacyLabel(mapping)}</option>)}</select>
            <select aria-label="مقصد نگاشت" className={selectClass} value={mappingTargetId} disabled={!selectedMapping} onChange={(event) => setMappingTargetId(event.target.value)}><option value="">مقصد نگاشت</option>{selectedMapping?.sourceType === "DEPARTMENT" ? services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>) : requestTypes.map((item) => <option key={item.id} value={item.id}>{item.service.name} / {item.name}</option>)}</select>
          </div>
          <div className="flex flex-wrap gap-2"><Button onClick={() => submitMapping("MAPPED")} disabled={reconcileMapping.isPending}>ثبت نگاشت</Button><Button variant="secondary" onClick={() => submitMapping("IGNORED")} disabled={reconcileMapping.isPending}>نادیده‌گرفتن مستند</Button><Button variant="destructive" onClick={() => submitMapping("CONFLICT")} disabled={reconcileMapping.isPending}>ثبت تعارض</Button></div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">خدمات و مسیرهای فعال</CardTitle></CardHeader>
          <CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>خدمت / درخواست</TableHead><TableHead>مسیر فعال</TableHead><TableHead>نسخه</TableHead></TableRow></TableHeader><TableBody>{requestTypes.map((item) => { const active = item.routes.find((routeItem) => routeItem.status === "ACTIVE"); return <TableRow key={item.id}><TableCell>{item.service.name}<br /><span className="text-muted-foreground">{item.name}</span></TableCell><TableCell>{active ? `${active.queue.team.name} / ${active.queue.name}` : <Badge variant="destructive">بدون مسیر</Badge>}</TableCell><TableCell>{active ? toPersianDigits(active.version) : "—"}</TableCell></TableRow>; })}</TableBody></Table></div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg">تیم‌ها، صف‌ها و اعضا</CardTitle></CardHeader>
          <CardContent className="space-y-4">{teams.map((team) => <div key={team.id} className="rounded-lg border p-4"><div className="flex items-center justify-between"><b>{team.name}</b><Badge variant="secondary">{team.code}</Badge></div><p className="mt-2 text-sm text-muted-foreground">صف‌ها: {team.queues.map((queue) => queue.name).join("، ")}</p><p className="mt-1 text-sm text-muted-foreground">اعضا: {team.roleAssignments.map((assignment) => `${assignment.user.firstName} ${assignment.user.lastName} (${assignment.role.name})`).join("، ") || "بدون عضو"}</p></div>)}</CardContent>
        </Card>
      </div>
    </div>
  );
}
