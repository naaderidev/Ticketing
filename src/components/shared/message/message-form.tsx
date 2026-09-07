"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MessageSquare } from "lucide-react";
import { labels, buttons, errors, descriptions } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";
import { UseFormRegister, UseFormHandleSubmit, FieldErrors, Controller, Control } from "react-hook-form";
import { PredefinedMessageInput } from "@/lib/validations";
import { SubDepartment } from "@/types/ticket";

const MESSAGE_TITLE_MAX = 100;
const MESSAGE_CONTENT_MAX = 5000;

interface MessageFormProps {
  isCreateDialogOpen: boolean;
  isEditDialogOpen: boolean;
  isDeleteDialogOpen: boolean;
  selectedMessageTitle: string | null;
  subDepartments: SubDepartment[];
  registerCreate: UseFormRegister<PredefinedMessageInput>;
  handleSubmitCreate: UseFormHandleSubmit<PredefinedMessageInput>;
  watchCreate: (name: string) => string;
  controlCreate: Control<PredefinedMessageInput>;
  errorsCreate: FieldErrors<PredefinedMessageInput>;
  registerEdit: UseFormRegister<PredefinedMessageInput>;
  handleSubmitEdit: UseFormHandleSubmit<PredefinedMessageInput>;
  watchEdit: (name: string) => string;
  controlEdit: Control<PredefinedMessageInput>;
  errorsEdit: FieldErrors<PredefinedMessageInput>;
  isCreatePending: boolean;
  isCreateError: boolean;
  isUpdatePending: boolean;
  isUpdateError: boolean;
  isDeletePending: boolean;
  onCreateSubmit: (data: PredefinedMessageInput) => void;
  onEditSubmit: (data: PredefinedMessageInput) => void;
  onDeleteConfirm: () => void;
  onCreateDialogClose: () => void;
  onEditDialogClose: () => void;
  onDeleteDialogClose: () => void;
}

export function MessageForm({
  isCreateDialogOpen,
  isEditDialogOpen,
  isDeleteDialogOpen,
  selectedMessageTitle,
  subDepartments,
  registerCreate,
  handleSubmitCreate,
  watchCreate,
  controlCreate,
  errorsCreate,
  registerEdit,
  handleSubmitEdit,
  watchEdit,
  controlEdit,
  errorsEdit,
  isCreatePending,
  isCreateError,
  isUpdatePending,
  isUpdateError,
  isDeletePending,
  onCreateSubmit,
  onEditSubmit,
  onDeleteConfirm,
  onCreateDialogClose,
  onEditDialogClose,
  onDeleteDialogClose,
}: MessageFormProps) {
  return (
    <>
      {/* Info Card */}
      <Card className="border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <MessageSquare className="h-5 w-5 text-white dark:text-white shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-white dark:text-white">
                استفاده از شورت‌کدها
              </p>
              <div className="text-sky-700 dark:text-sky-300 mt-1">
                هنگام پاسخ‌دهی به تیکت، می‌توانید با کلیک روی دکمه
                &quot;پیام‌های آماده&quot; و انتخاب شورت‌کد، متن پیش‌فرض را درج
                کنید. شورت‌کد با فرمت{" "}
                <Badge variant="secondary" className="font-mono">
                  {"{shortcode}"}
                </Badge>{" "}
                نمایش داده می‌شود.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={onCreateDialogClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>ایجاد پیام پیش‌فرض جدید</DialogTitle>
            <DialogDescription>
              پیام پیش‌فرض جدید با شورت‌کد اختصاصی ایجاد کنید
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitCreate(onCreateSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{labels.MESSAGE_TITLE}</Label>
                <Input
                  placeholder={labels.MESSAGE_TITLE}
                  {...registerCreate("title")}
                  maxLength={MESSAGE_TITLE_MAX}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{toPersianDigits((watchCreate("title") || "").length)} / {toPersianDigits(MESSAGE_TITLE_MAX)}</span>
                </div>
                {errorsCreate.title && (
                  <p className="text-destructive text-sm">{errorsCreate.title.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{labels.MESSAGE_SHORT_CODE}</Label>
                <Input
                  placeholder={labels.MESSAGE_SHORT_CODE}
                  {...registerCreate("shortCode")}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  فقط حروف انگلیسی، اعداد و زیرخط
                </p>
                {errorsCreate.shortCode && (
                  <p className="text-destructive text-sm">{errorsCreate.shortCode.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>دسته‌بندی</Label>
              <Controller
                control={controlCreate}
                name="subDepartmentId"
                render={({ field }) => (
                  <Select
                    value={field.value?.toString() || ""}
                    onValueChange={(val) => field.onChange(val ? Number(val) : null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="عمومی" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">عمومی</SelectItem>
                      {subDepartments.map((sd) => (
                        <SelectItem key={sd.id} value={sd.id.toString()}>
                          {sd.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground">
                در صورت انتخاب نکردن، پیام در دسته عمومی قرار می‌گیرد
              </p>
            </div>

            <div className="space-y-2">
              <Label>{labels.MESSAGE_CONTENT}</Label>
              <Textarea
                placeholder={labels.MESSAGE_CONTENT}
                className="min-h-[200px]"
                {...registerCreate("content")}
                maxLength={MESSAGE_CONTENT_MAX}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{toPersianDigits((watchCreate("content") || "").length)} / {toPersianDigits(MESSAGE_CONTENT_MAX)}</span>
              </div>
              {errorsCreate.content && (
                <p className="text-destructive text-sm">{errorsCreate.content.message}</p>
              )}
            </div>

            {isCreateError && (
              <p className="text-sm text-destructive">{errors.CREATE_MESSAGE}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCreateDialogClose}>
                {buttons.CANCEL}
              </Button>
              <Button type="submit" disabled={isCreatePending}>
                {buttons.ADD}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={onEditDialogClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{descriptions.MESSAGE_EDIT_DESCRIPTION}</DialogTitle>
            <DialogDescription>
              {descriptions.MESSAGE_EDIT_DESCRIPTION}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitEdit(onEditSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{labels.MESSAGE_TITLE}</Label>
                <Input
                  placeholder={labels.MESSAGE_TITLE}
                  {...registerEdit("title")}
                  maxLength={MESSAGE_TITLE_MAX}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{toPersianDigits((watchEdit("title") || "").length)} / {toPersianDigits(MESSAGE_TITLE_MAX)}</span>
                </div>
                {errorsEdit.title && (
                  <p className="text-destructive text-sm">{errorsEdit.title.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{labels.MESSAGE_SHORT_CODE}</Label>
                <Input
                  placeholder={labels.MESSAGE_SHORT_CODE}
                  {...registerEdit("shortCode")}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  فقط حروف انگلیسی، اعداد و زیرخط
                </p>
                {errorsEdit.shortCode && (
                  <p className="text-destructive text-sm">{errorsEdit.shortCode.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{labels.MESSAGE_CATEGORY}</Label>
              <Controller
                control={controlEdit}
                name="subDepartmentId"
                render={({ field }) => (
                  <Select
                    value={field.value?.toString() || ""}
                    onValueChange={(val) => field.onChange(val ? Number(val) : null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={labels.GENERAL} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">{labels.GENERAL}</SelectItem>
                      {subDepartments.map((sd) => (
                        <SelectItem key={sd.id} value={sd.id.toString()}>
                          {sd.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>{labels.MESSAGE_CONTENT}</Label>
              <Textarea
                placeholder={labels.MESSAGE_CONTENT}
                className="min-h-[200px]"
                {...registerEdit("content")}
                maxLength={MESSAGE_CONTENT_MAX}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{toPersianDigits((watchEdit("content") || "").length)} / {toPersianDigits(MESSAGE_CONTENT_MAX)}</span>
              </div>
              {errorsEdit.content && (
                <p className="text-destructive text-sm">{errorsEdit.content.message}</p>
              )}
            </div>

            {isUpdateError && (
              <p className="text-sm text-destructive">{errors.UPDATE_MESSAGE}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onEditDialogClose}>
                {buttons.CANCEL}
              </Button>
              <Button type="submit" disabled={isUpdatePending}>
                {buttons.SAVE}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={onDeleteDialogClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{buttons.DELETE_MESSAGE}</AlertDialogTitle>
            <AlertDialogDescription>
              آیا مطمئن هستید که می‌خواهید پیام &quot;{selectedMessageTitle}
              &quot; را حذف کنید؟
              <br />
              <span className="text-destructive">
                این عمل غیرقابل بازگشت است.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{buttons.CANCEL}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeletePending}
            >
              {buttons.DELETE}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
