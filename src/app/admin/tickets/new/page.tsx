"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, User, UserPlus } from "lucide-react";
import { labels, titles, descriptions, buttons, placeholders, errors, misc } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";
import { useUsers, useDepartments, useSubDepartments, useCreateTicket } from "@/hooks";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTicketSchema, CreateTicketInput } from "@/lib/validations";
import { toast } from "sonner";

export default function AdminNewTicketPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
      <AdminNewTicketContent />
    </Suspense>
  );
}

function AdminNewTicketContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");

  const { data: users = [] } = useUsers();
  const { data: departments = [] } = useDepartments();
  const createTicket = useCreateTicket();

  const { register, handleSubmit, watch, setValue, formState: { errors: formErrors } } = useForm<CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
  });

  const selectedDepartmentId = watch("departmentId");

  const { data: subDepartments = [] } = useSubDepartments(
    selectedDepartmentId ? Number.parseInt(selectedDepartmentId) : 0,
  );

  const user = users.find((u) => u.id === Number.parseInt(userId || "0"));

  const onSubmit = async (data: CreateTicketInput) => {
    createTicket.mutate(
      {
        userName: "مدیر",
        subject: data.subject.trim(),
        message: data.message.trim(),
        departmentId: data.departmentId,
        subDepartmentId: data.subDepartmentId,
        userId: Number.parseInt(userId || "0"),
      },
      {
        onSuccess: (ticket) => {
          toast.success("تیکت با موفقیت ایجاد شد");
          router.push(`/admin/tickets/${ticket.ticketId}`);
        },
        onError: (err) => {
          toast.error(err.message || errors.CREATE_TICKET);
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container pb-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold">{titles.CREATE_TICKET}</h1>
            <p className="text-muted-foreground">{descriptions.TICKET_CREATE_DESCRIPTION}</p>
          </div>

          {user && (
            <Card className="border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-primary">
              <CardContent className="p-4 bg-primary rounded-md">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
                    <UserPlus className="h-5 w-5 text-pimary" />
                  </div>
                  <div className="text-white">
                    <p className="font-medium">
                      {user.firstName} {user.lastName}
                    </p>
                    <p
                      className="text-sm font-medium"
                      dir="ltr"
                    >
                      {user.mobile}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{labels.TICKET_SUBJECT}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{labels.TICKET_DEPARTMENT_SELECT} *</Label>
                    <Select
                      value={watch("departmentId")}
                      onValueChange={(val) => setValue("departmentId", val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={labels.SELECT_DEPARTMENT} />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id.toString()}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formErrors.departmentId && (
                      <p className="text-destructive text-sm">{formErrors.departmentId.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>{labels.TICKET_SUB_DEPARTMENT_SELECT} *</Label>
                    <Select
                      value={watch("subDepartmentId")}
                      onValueChange={(val) => setValue("subDepartmentId", val)}
                      disabled={!selectedDepartmentId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={labels.SELECT_SUB_DEPARTMENT} />
                      </SelectTrigger>
                      <SelectContent>
                        {subDepartments.map((subDept) => (
                          <SelectItem
                            key={subDept.id}
                            value={subDept.id.toString()}
                          >
                            {subDept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formErrors.subDepartmentId && (
                      <p className="text-destructive text-sm">{formErrors.subDepartmentId.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{labels.TICKET_SUBJECT_LABEL}</Label>
                  <Input
                    placeholder={placeholders.TICKET_SUBJECT_PLACEHOLDER}
                    {...register("subject")}
                  />
                  {formErrors.subject && (
                    <p className="text-destructive text-sm">{formErrors.subject.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>{labels.TICKET_MESSAGE_LABEL}</Label>
                  <Textarea
                    placeholder={placeholders.TICKET_MESSAGE_PLACEHOLDER}
                    className="min-h-37.5"
                    {...register("message")}
                    maxLength={1000}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{toPersianDigits((watch("message") || "").length)} / ۱۰۰۰</span>
                  </div>
                  {formErrors.message && (
                    <p className="text-destructive text-sm">{formErrors.message.message}</p>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={createTicket.isPending}
                  >
                    {createTicket.isPending ? (
                      <>
                        <div className="ml-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        {misc.LOADING}
                      </>
                    ) : (
                      <>
                        <Send className="ml-2 h-4 w-4" />
                        {buttons.SEND_TICKET}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
