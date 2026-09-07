"use client";

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
import { labels, buttons, errors, descriptions } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";
import { UseFormRegister, UseFormHandleSubmit, FieldErrors } from "react-hook-form";
import { FaqInput } from "@/lib/validations";
import { Department, SubDepartment } from "@/types/ticket";

const FAQ_QUESTION_MAX = 500;
const FAQ_ANSWER_MAX = 5000;

interface FAQFormProps {
  isCreateDialogOpen: boolean;
  isEditDialogOpen: boolean;
  isDeleteDialogOpen: boolean;
  departments: Department[];
  formSubDepartments: SubDepartment[];
  registerCreate: UseFormRegister<FaqInput>;
  handleSubmitCreate: UseFormHandleSubmit<FaqInput>;
  watchCreate: (name: string) => string;
  errorsCreate: FieldErrors<FaqInput>;
  registerEdit: UseFormRegister<FaqInput>;
  handleSubmitEdit: UseFormHandleSubmit<FaqInput>;
  watchEdit: (name: string) => string;
  errorsEdit: FieldErrors<FaqInput>;
  isCreatePending: boolean;
  isCreateError: boolean;
  isUpdatePending: boolean;
  isUpdateError: boolean;
  isDeletePending: boolean;
  onCreateSubmit: (data: FaqInput) => void;
  onEditSubmit: (data: FaqInput) => void;
  onDeleteConfirm: () => void;
  onCreateDialogClose: () => void;
  onEditDialogClose: () => void;
  onDeleteDialogClose: () => void;
  onCreateDeptChange: (value: string) => void;
  onCreateSubDeptChange: (value: string) => void;
  locked?: boolean;
}

export function FAQForm({
  isCreateDialogOpen,
  isEditDialogOpen,
  isDeleteDialogOpen,
  departments,
  formSubDepartments,
  registerCreate,
  handleSubmitCreate,
  watchCreate,
  errorsCreate,
  registerEdit,
  handleSubmitEdit,
  watchEdit,
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
  onCreateDeptChange,
  onCreateSubDeptChange,
  locked = false,
}: FAQFormProps) {
  return (
    <>
      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={onCreateDialogClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{buttons.CREATE_FAQ}</DialogTitle>
            <DialogDescription>{descriptions.FAQ_CREATE_DESCRIPTION}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitCreate(onCreateSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{labels.FAQ_DEPARTMENT}</Label>
                <Select
                  value={watchCreate("departmentId")}
                  onValueChange={onCreateDeptChange}
                  disabled={locked}
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
                {errorsCreate.departmentId && (
                  <p className="text-destructive text-sm">{errorsCreate.departmentId.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>{labels.FAQ_SUB_DEPARTMENT}</Label>
                <Select
                  value={watchCreate("subDepartmentId") || ""}
                  onValueChange={onCreateSubDeptChange}
                  disabled={locked || !watchCreate("departmentId")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={labels.SELECT_SUB_DEPARTMENT} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{labels.NO_SUB_DEPARTMENT}</SelectItem>
                    {formSubDepartments.map((subDept) => (
                      <SelectItem key={subDept.id} value={subDept.id.toString()}>
                        {subDept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{labels.FAQ_QUESTION}</Label>
              <Input
                placeholder={labels.FAQ_QUESTION}
                {...registerCreate("question")}
                maxLength={FAQ_QUESTION_MAX}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{toPersianDigits((watchCreate("question") || "").length)} / {toPersianDigits(FAQ_QUESTION_MAX)}</span>
              </div>
              {errorsCreate.question && (
                <p className="text-destructive text-sm">{errorsCreate.question.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>{labels.FAQ_ANSWER}</Label>
              <Textarea
                placeholder={labels.FAQ_ANSWER}
                className="min-h-[150px]"
                {...registerCreate("answer")}
                maxLength={FAQ_ANSWER_MAX}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{toPersianDigits((watchCreate("answer") || "").length)} / {toPersianDigits(FAQ_ANSWER_MAX)}</span>
              </div>
              {errorsCreate.answer && (
                <p className="text-destructive text-sm">{errorsCreate.answer.message}</p>
              )}
            </div>

            {isCreateError && (
              <p className="text-sm text-destructive">{errors.CREATE_FAQ}</p>
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
            <DialogTitle>{descriptions.FAQ_EDIT_DESCRIPTION}</DialogTitle>
            <DialogDescription>{descriptions.FAQ_EDIT_DESCRIPTION}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitEdit(onEditSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>{labels.FAQ_QUESTION}</Label>
              <Input
                placeholder={labels.FAQ_QUESTION}
                {...registerEdit("question")}
                maxLength={FAQ_QUESTION_MAX}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{toPersianDigits((watchEdit("question") || "").length)} / {toPersianDigits(FAQ_QUESTION_MAX)}</span>
              </div>
              {errorsEdit.question && (
                <p className="text-destructive text-sm">{errorsEdit.question.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>{labels.FAQ_ANSWER}</Label>
              <Textarea
                placeholder={labels.FAQ_ANSWER}
                className="min-h-[150px]"
                {...registerEdit("answer")}
                maxLength={FAQ_ANSWER_MAX}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{toPersianDigits((watchEdit("answer") || "").length)} / {toPersianDigits(FAQ_ANSWER_MAX)}</span>
              </div>
              {errorsEdit.answer && (
                <p className="text-destructive text-sm">{errorsEdit.answer.message}</p>
              )}
            </div>

            {isUpdateError && (
              <p className="text-sm text-destructive">{errors.UPDATE_FAQ}</p>
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
            <AlertDialogTitle>{buttons.DELETE_FAQ}</AlertDialogTitle>
            <AlertDialogDescription>
              آیا مطمئن هستید که می‌خواهید این پرسش و پاسخ را حذف کنید؟
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
