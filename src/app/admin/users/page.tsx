"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Users, Send, Plus } from "lucide-react";
import { labels, titles, buttons, errors } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";
import { useUsers, useCreateUser, useUpdateUserRole } from "@/hooks";
import { useForm, Controller } from "react-hook-form";
import dynamic from "next/dynamic";

const DatePicker = dynamic(() => import("react-multi-date-picker"), { ssr: false });

import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import { zodResolver } from "@hookform/resolvers/zod";
import { createUserSchema, CreateUserInput } from "@/lib/validations";
import { toast } from "sonner";

export default function AdminUsersPage() {
  const { data: users = [], isLoading } = useUsers();
  const createUser = useCreateUser();
  const updateUserRole = useUpdateUserRole();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const { register, handleSubmit, reset, control, watch, formState: { errors: formErrors, isValid } } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    mode: "onChange",
  });

  useEffect(() => {
    if (isCreateDialogOpen) {
      reset();
    }
  }, [isCreateDialogOpen, reset]);

  const onSubmit = async (data: CreateUserInput) => {
    createUser.mutate(data, {
      onSuccess: () => {
        toast.success("کاربر با موفقیت ایجاد شد");
        setIsCreateDialogOpen(false);
        reset();
      },
      onError: (err) => {
        toast.error(err.message || errors.CREATE_USER);
      },
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container pb-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{titles.ADMIN_USER_LIST}</h1>
              <p className="text-muted-foreground">{toPersianDigits(users.length)} کاربر</p>
            </div>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="ml-2 h-4 w-4" />
              {buttons.CREATE_USER}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Users className="mb-2 h-8 w-8 opacity-50" />
                  <p>{labels.EMPTY_USERS}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-center">{labels.USER_FIRST_NAME}</TableHead>
                        <TableHead className="text-center">{labels.USER_LAST_NAME}</TableHead>
                        <TableHead className="text-center">{labels.USER_NATIONAL_CODE}</TableHead>
                        <TableHead className="text-center">{labels.USER_MOBILE}</TableHead>
                        <TableHead className="text-center">{labels.USER_EMAIL}</TableHead>
                        <TableHead className="text-center">{labels.USER_BIRTHDAY}</TableHead>
                        <TableHead className="text-center">{labels.USER_ROLE}</TableHead>
                        <TableHead className="text-center">{labels.USER_ACTIONS}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="text-center font-medium">
                            {user.firstName}
                          </TableCell>
                          <TableCell className="text-center">{user.lastName}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className="font-mono">
                              {user.nationalCode}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center" dir="ltr">{user.mobile}</TableCell>
                          <TableCell className="text-center">{user.email || "-"}</TableCell>
                          <TableCell className="text-center">{user.birthday ? toPersianDigits(user.birthday) : "-"}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                              {user.role === "ADMIN" ? "مدیر" : "کاربر"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Link href={`/admin/tickets/new?userId=${user.id}`}>
                                <Button size="sm">
                                  <Send className="ml-1 h-4 w-4" />
                                  {buttons.SEND_TICKET}
                                </Button>
                              </Link>
                              <Button
                                size="sm"
                                variant={user.role === "ADMIN" ? "outline" : "secondary"}
                                onClick={() => {
                                  const newRole = user.role === "ADMIN" ? "USER" : "ADMIN";
                                  updateUserRole.mutate(
                                    { userId: user.id, role: newRole },
                                    {
                                      onSuccess: () => {
                                        toast.success(`نقش کاربر به ${newRole === "ADMIN" ? "مدیر" : "کاربر"} تغییر کرد`);
                                      },
                                      onError: (err: Error) => {
                                        toast.error(err.message || "خطا در تغییر نقش");
                                      },
                                    }
                                  );
                                }}
                                disabled={updateUserRole.isPending}
                              >
                                {user.role === "ADMIN" ? "تبدیل به کاربر" : "تبدیل به مدیر"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{buttons.CREATE_USER}</DialogTitle>
            <DialogDescription>کاربر جدید ایجاد کنید</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{labels.USER_FIRST_NAME}</Label>
                <Input
                  placeholder={labels.USER_FIRST_NAME}
                  {...register("firstName")}
                />
                {formErrors.firstName && (
                  <p className="text-destructive text-sm">{formErrors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{labels.USER_LAST_NAME}</Label>
                <Input
                  placeholder={labels.USER_LAST_NAME}
                  {...register("lastName")}
                />
                {formErrors.lastName && (
                  <p className="text-destructive text-sm">{formErrors.lastName.message}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{labels.USER_NATIONAL_CODE}</Label>
                <Input
                  placeholder={labels.USER_NATIONAL_CODE}
                  {...register("nationalCode")}
                  dir="ltr"
                />
                {formErrors.nationalCode && (
                  <p className="text-destructive text-sm">{formErrors.nationalCode.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{labels.USER_MOBILE}</Label>
                <Input
                  placeholder={labels.USER_MOBILE}
                  {...register("mobile")}
                  dir="ltr"
                />
                {formErrors.mobile && (
                  <p className="text-destructive text-sm">{formErrors.mobile.message}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{labels.USER_EMAIL}</Label>
                <Input
                  placeholder={labels.USER_EMAIL}
                  {...register("email")}
                  dir="ltr"
                />
                {formErrors.email && (
                  <p className="text-destructive text-sm">{formErrors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{labels.USER_BIRTHDAY}</Label>
                <Controller
                  control={control}
                  name="birthday"
                  render={({ field }) => (
                    <DatePicker
                      containerClassName="w-full"
                      style={{ width: "100%" }}
                      inputClass="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={field.value || ""}
                      onChange={(date) => {
                        field.onChange(date && !Array.isArray(date) ? date.format("YYYY/MM/DD") : "");
                      }}
                      calendar={persian}
                      locale={persian_fa}
                      format="YYYY/MM/DD"
                      calendarPosition="bottom-right"
                      placeholder="انتخاب تاریخ تولد"
                    />
                  )}
                />
                {formErrors.birthday && (
                  <p className="text-destructive text-sm">{formErrors.birthday.message}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{labels.USER_PASSWORD}</Label>
                <Input
                  type="password"
                  placeholder={labels.USER_PASSWORD}
                  {...register("password")}
                  dir="ltr"
                />
                {formErrors.password && (
                  <p className="text-destructive text-sm">{formErrors.password.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{labels.CONFIRM_PASSWORD}</Label>
                <Input
                  type="password"
                  placeholder={labels.CONFIRM_PASSWORD}
                  {...register("confirmPassword")}
                  dir="ltr"
                />
                {formErrors.confirmPassword && (
                  <p className="text-destructive text-sm">{formErrors.confirmPassword.message}</p>
                )}
              </div>
            </div>

            {createUser.isError && (
              <p className="text-sm text-destructive">{errors.CREATE_USER}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  reset();
                }}
              >
                {buttons.CANCEL}
              </Button>
              <Button type="submit" disabled={createUser.isPending || !isValid}>
                {createUser.isPending ? buttons.ADD : buttons.ADD}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
