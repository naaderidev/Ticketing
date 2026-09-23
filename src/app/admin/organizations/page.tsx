"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, Plus, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
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
  type OrganizationAccessRequest,
  useCreateOrganization,
  useCreateOrganizationAccessRequest,
  useDecideOrganizationAccessRequest,
  useOrganizationAccessRequests,
  useOrganizationMemberships,
  useOrganizations,
  useUsers,
} from "@/hooks";
import { toPersianDigits } from "@/lib/format";

type AccessRequestType = OrganizationAccessRequest["requestType"];
type Decision = "approve" | "reject";

const requestTypeLabels: Record<AccessRequestType, string> = {
  ADD_MEMBERSHIP: "افزودن عضو",
  CHANGE_ROLE: "تغییر نقش",
  CHANGE_SCOPE: "تغییر محدوده",
  REVOKE_MEMBERSHIP: "لغو عضویت",
};

const statusLabels: Record<OrganizationAccessRequest["status"], string> = {
  PENDING: "در انتظار",
  APPROVED: "تأییدشده",
  REJECTED: "ردشده",
  EXECUTED: "اعمال‌شده",
};

function userDisplayName(user: { firstName: string; lastName: string; id: number }) {
  return `${user.firstName} ${user.lastName} — ${toPersianDigits(user.id)}`;
}

export default function AdminOrganizationsPage() {
  const organizationsQuery = useOrganizations();
  const { data: users = [] } = useUsers();
  const organizations = useMemo(
    () => organizationsQuery.data ?? [],
    [organizationsQuery.data]
  );
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<
    number | null
  >(null);
  const membershipsQuery = useOrganizationMemberships(selectedOrganizationId);
  const requestsQuery = useOrganizationAccessRequests(selectedOrganizationId);
  const createOrganization = useCreateOrganization();
  const createRequest = useCreateOrganizationAccessRequest(
    selectedOrganizationId
  );
  const decideRequest = useDecideOrganizationAccessRequest(
    selectedOrganizationId
  );

  const [legalName, setLegalName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [managerUserId, setManagerUserId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [requestType, setRequestType] =
    useState<AccessRequestType>("ADD_MEMBERSHIP");
  const [requestedRole, setRequestedRole] = useState<
    "REPRESENTATIVE" | "MANAGER"
  >("REPRESENTATIVE");
  const [scopeType, setScopeType] = useState<
    "ORGANIZATION" | "BRANCH" | "CONTRACT" | "ASSET"
  >("ORGANIZATION");
  const [scopeKey, setScopeKey] = useState("*");
  const [requestReason, setRequestReason] = useState("");
  const [decisionTarget, setDecisionTarget] = useState<{
    requestId: number;
    decision: Decision;
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const accessTargetRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (
      organizations.length > 0 &&
      !organizations.some((organization) => organization.id === selectedOrganizationId)
    ) {
      setSelectedOrganizationId(organizations[0].id);
    }
  }, [organizations, selectedOrganizationId]);

  const selectedOrganization = useMemo(
    () =>
      organizations.find(
        (organization) => organization.id === selectedOrganizationId
      ) ?? null,
    [organizations, selectedOrganizationId]
  );

  const submitOrganization = () => {
    const parsedManagerId = Number(managerUserId);
    if (!legalName.trim() || !Number.isSafeInteger(parsedManagerId)) {
      toast.error("نام سازمان و مدیر اولیه را کامل کنید");
      return;
    }

    createOrganization.mutate(
      {
        legalName: legalName.trim(),
        nationalId: nationalId.trim() || undefined,
        managerUserId: parsedManagerId,
      },
      {
        onSuccess: () => {
          toast.success("سازمان ایجاد شد");
          setLegalName("");
          setNationalId("");
          setManagerUserId("");
        },
        onError: (error) => toast.error(error.message),
      }
    );
  };

  const submitAccessRequest = () => {
    const parsedTargetId = Number(targetUserId);
    if (!Number.isSafeInteger(parsedTargetId) || requestReason.trim().length < 5) {
      toast.error("کاربر هدف و دلیل درخواست را کامل کنید");
      return;
    }

    const needsRole = ["ADD_MEMBERSHIP", "CHANGE_ROLE"].includes(requestType);
    const needsScope = ["ADD_MEMBERSHIP", "CHANGE_SCOPE"].includes(requestType);
    const requestsManagerScope = needsRole && requestedRole === "MANAGER";
    const effectiveScope =
      requestsManagerScope && needsScope
        ? { type: "ORGANIZATION" as const, scopeKey: "*" }
        : { type: scopeType, scopeKey: scopeKey.trim() };

    if (needsScope && !effectiveScope.scopeKey) {
      toast.error("محدوده دسترسی را وارد کنید");
      return;
    }

    createRequest.mutate(
      {
        targetUserId: parsedTargetId,
        requestType,
        requestedRole: needsRole ? requestedRole : undefined,
        scopes: needsScope ? [effectiveScope] : [],
        reason: requestReason.trim(),
      },
      {
        onSuccess: () => {
          toast.success("درخواست دسترسی ثبت شد و منتظر تأیید مستقل است");
          setTargetUserId("");
          setRequestReason("");
        },
        onError: (error) => toast.error(error.message),
      }
    );
  };

  const startAddMembershipRequest = () => {
    setRequestType("ADD_MEMBERSHIP");
    accessTargetRef.current?.scrollIntoView?.({
      behavior: "smooth",
      block: "center",
    });
    accessTargetRef.current?.focus();
  };

  const submitDecision = () => {
    if (!decisionTarget || decisionReason.trim().length < 5) {
      toast.error("دلیل تصمیم باید حداقل ۵ کاراکتر باشد");
      return;
    }
    decideRequest.mutate(
      { ...decisionTarget, reason: decisionReason.trim() },
      {
        onSuccess: () => {
          toast.success(
            decisionTarget.decision === "approve"
              ? "درخواست تأیید و اعمال شد"
              : "درخواست رد شد"
          );
          setDecisionTarget(null);
          setDecisionReason("");
        },
        onError: (error) => toast.error(error.message),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">سازمان‌ها و دسترسی نمایندگان</h1>
        <p className="text-muted-foreground">
          ایجاد شرکت، عضویت Scopeدار و تأیید مستقل تغییرات حساس
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-5 w-5" /> ایجاد سازمان
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="organization-name">نام حقوقی</Label>
            <Input
              id="organization-name"
              value={legalName}
              onChange={(event) => setLegalName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="organization-national-id">شناسه ملی (اختیاری)</Label>
            <Input
              id="organization-national-id"
              value={nationalId}
              onChange={(event) => setNationalId(event.target.value)}
              inputMode="numeric"
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="organization-manager">مدیر اولیه</Label>
            <select
              id="organization-manager"
              value={managerUserId}
              onChange={(event) => setManagerUserId(event.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">انتخاب کاربر</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {userDisplayName(user)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              onClick={submitOrganization}
              disabled={createOrganization.isPending}
            >
              ایجاد سازمان
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">سازمان‌های مجاز</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {organizationsQuery.isLoading && <p>در حال دریافت...</p>}
            {organizationsQuery.isError && (
              <p className="text-sm text-destructive">
                {organizationsQuery.error.message}
              </p>
            )}
            {!organizationsQuery.isLoading && organizations.length === 0 && (
              <p className="text-sm text-muted-foreground">سازمانی وجود ندارد.</p>
            )}
            {organizations.map((organization) => (
              <Button
                key={organization.id}
                variant={
                  organization.id === selectedOrganizationId
                    ? "secondary"
                    : "ghost"
                }
                className="h-auto w-full justify-start py-3 text-right"
                onClick={() => setSelectedOrganizationId(organization.id)}
              >
                <Building2 className="ml-2 h-4 w-4 shrink-0" />
                <span className="truncate">{organization.legalName}</span>
              </Button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {selectedOrganization ? (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <CardTitle className="flex items-center justify-between gap-3 text-lg">
                    <span>{selectedOrganization.legalName}</span>
                    <Badge variant="secondary">
                      {toPersianDigits(
                        membershipsQuery.data?.memberships.length ?? 0
                      )}{" "}
                      عضو
                    </Badge>
                  </CardTitle>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={startAddMembershipRequest}
                    aria-controls="organization-access-request"
                  >
                    <Plus className="ml-1 h-4 w-4" /> افزودن عضو
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>کاربر</TableHead>
                          <TableHead>نقش</TableHead>
                          <TableHead>وضعیت</TableHead>
                          <TableHead>محدوده‌ها</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(membershipsQuery.data?.memberships ?? []).map(
                          (membership) => (
                            <TableRow key={membership.id}>
                              <TableCell>
                                {membership.user.firstName}{" "}
                                {membership.user.lastName}
                              </TableCell>
                              <TableCell>
                                {membership.role === "MANAGER" ? "مدیر" : "نماینده"}
                              </TableCell>
                              <TableCell>{membership.status}</TableCell>
                              <TableCell dir="ltr">
                                {membership.scopes
                                  .map((scope) => `${scope.type}:${scope.scopeKey}`)
                                  .join("، ") || "—"}
                              </TableCell>
                            </TableRow>
                          )
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card id="organization-access-request">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ShieldCheck className="h-5 w-5" /> مدیریت عضویت و دسترسی
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="access-target">کاربر هدف</Label>
                    <select
                      ref={accessTargetRef}
                      id="access-target"
                      value={targetUserId}
                      onChange={(event) => setTargetUserId(event.target.value)}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="">انتخاب کاربر</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {userDisplayName(user)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="access-type">نوع درخواست</Label>
                    <select
                      id="access-type"
                      value={requestType}
                      onChange={(event) =>
                        setRequestType(event.target.value as AccessRequestType)
                      }
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      {Object.entries(requestTypeLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {["ADD_MEMBERSHIP", "CHANGE_ROLE"].includes(requestType) && (
                    <div className="space-y-2">
                      <Label htmlFor="access-role">نقش درخواستی</Label>
                      <select
                        id="access-role"
                        value={requestedRole}
                        onChange={(event) =>
                          setRequestedRole(
                            event.target.value as "REPRESENTATIVE" | "MANAGER"
                          )
                        }
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      >
                        <option value="REPRESENTATIVE">نماینده</option>
                        <option value="MANAGER">مدیر شرکت</option>
                      </select>
                    </div>
                  )}
                  {["ADD_MEMBERSHIP", "CHANGE_SCOPE"].includes(requestType) &&
                    !(
                      requestType === "ADD_MEMBERSHIP" &&
                      requestedRole === "MANAGER"
                    ) && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="scope-type">نوع محدوده</Label>
                          <select
                            id="scope-type"
                            value={scopeType}
                            onChange={(event) =>
                              setScopeType(
                                event.target.value as typeof scopeType
                              )
                            }
                            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                          >
                            <option value="ORGANIZATION">کل سازمان</option>
                            <option value="BRANCH">شعبه</option>
                            <option value="CONTRACT">قرارداد</option>
                            <option value="ASSET">دارایی</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="scope-key">کلید محدوده</Label>
                          <Input
                            id="scope-key"
                            value={scopeKey}
                            onChange={(event) => setScopeKey(event.target.value)}
                            dir="ltr"
                          />
                        </div>
                      </>
                    )}
                  <div className="space-y-2 md:col-span-2 xl:col-span-3">
                    <Label htmlFor="access-reason">دلیل درخواست</Label>
                    <Textarea
                      id="access-reason"
                      value={requestReason}
                      onChange={(event) => setRequestReason(event.target.value)}
                      maxLength={500}
                    />
                  </div>
                  <div className="md:col-span-2 xl:col-span-3">
                    <Button
                      onClick={submitAccessRequest}
                      disabled={createRequest.isPending}
                    >
                      ثبت درخواست برای تأیید مستقل
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">درخواست‌های دسترسی</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>نوع</TableHead>
                          <TableHead>کاربر هدف</TableHead>
                          <TableHead>درخواست‌کننده</TableHead>
                          <TableHead>وضعیت</TableHead>
                          <TableHead>عملیات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(requestsQuery.data ?? []).map((accessRequest) => (
                          <TableRow key={accessRequest.id}>
                            <TableCell>
                              {requestTypeLabels[accessRequest.requestType]}
                            </TableCell>
                            <TableCell>
                              {accessRequest.targetUser.firstName}{" "}
                              {accessRequest.targetUser.lastName}
                            </TableCell>
                            <TableCell>
                              {accessRequest.requestedBy.firstName}{" "}
                              {accessRequest.requestedBy.lastName}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  accessRequest.status === "PENDING"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {statusLabels[accessRequest.status]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {accessRequest.status === "PENDING" ? (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      setDecisionTarget({
                                        requestId: accessRequest.id,
                                        decision: "approve",
                                      })
                                    }
                                  >
                                    <Check className="ml-1 h-4 w-4" /> تأیید
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() =>
                                      setDecisionTarget({
                                        requestId: accessRequest.id,
                                        decision: "reject",
                                      })
                                    }
                                  >
                                    <X className="ml-1 h-4 w-4" /> رد
                                  </Button>
                                </div>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                برای مدیریت دسترسی، ابتدا یک سازمان ایجاد یا انتخاب کنید.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog
        open={decisionTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDecisionTarget(null);
            setDecisionReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionTarget?.decision === "approve"
                ? "تأیید درخواست دسترسی"
                : "رد درخواست دسترسی"}
            </DialogTitle>
            <DialogDescription>
              تصمیم ثبت‌شده قابل تکرار نیست و همراه هویت تأییدکننده Audit می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="decision-reason">دلیل تصمیم</Label>
            <Textarea
              id="decision-reason"
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionTarget(null)}>
              انصراف
            </Button>
            <Button
              variant={
                decisionTarget?.decision === "reject" ? "destructive" : "default"
              }
              onClick={submitDecision}
              disabled={decideRequest.isPending}
            >
              ثبت تصمیم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
