"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Pencil, Trash2, FolderOpen, Building2, HelpCircle } from "lucide-react";
import { labels, buttons, errors, descriptions } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";
import Link from "next/link";
import { SubDepartmentWithCount } from "@/types/shared";

interface DepartmentSubDepartmentsProps {
  subDepartments: SubDepartmentWithCount[];
  isLoading: boolean;
  isCreateDialogOpen: boolean;
  isEditDialogOpen: boolean;
  isDeleteDialogOpen: boolean;
  selectedSubDepartment: SubDepartmentWithCount | null;
  newSubDepartmentName: string;
  editSubDepartmentName: string;
  isSubmitting: boolean;
  error: string | null;
  departmentId: string;
  onOpenCreateDialog: () => void;
  onCreateDialogClose: () => void;
  onEditDialogClose: () => void;
  onDeleteDialogClose: () => void;
  onCreateConfirm: () => void;
  onEditConfirm: () => void;
  onDeleteConfirm: () => void;
  onNewSubDepartmentNameChange: (value: string) => void;
  onEditSubDepartmentNameChange: (value: string) => void;
  onEditClick: (subDept: SubDepartmentWithCount) => void;
  onDeleteClick: (subDept: SubDepartmentWithCount) => void;
}

export function DepartmentSubDepartments({
  subDepartments,
  isLoading,
  isCreateDialogOpen,
  isEditDialogOpen,
  isDeleteDialogOpen,
  selectedSubDepartment,
  newSubDepartmentName,
  editSubDepartmentName,
  isSubmitting,
  error,
  departmentId,
  onOpenCreateDialog,
  onCreateDialogClose,
  onEditDialogClose,
  onDeleteDialogClose,
  onCreateConfirm,
  onEditConfirm,
  onDeleteConfirm,
  onNewSubDepartmentNameChange,
  onEditSubDepartmentNameChange,
  onEditClick,
  onDeleteClick,
}: Readonly<DepartmentSubDepartmentsProps>) {
  return (
    <>
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : subDepartments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="mb-2 h-8 w-8 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">{labels.EMPTY_SUB_DEPARTMENTS}</p>
            <Button variant="link" onClick={onOpenCreateDialog} className="mt-2">
              {labels.SUB_DEPARTMENT_FIRST}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {subDepartments.map((subDept) => (
            <Card key={subDept.id} className="relative overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{subDept.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onEditClick(subDept)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => onDeleteClick(subDept)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <HelpCircle className="h-4 w-4" />
                    <span>{toPersianDigits(subDept._count.faqs)} پرسش متداول</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <FolderOpen className="h-4 w-4" />
                    <span>{toPersianDigits(subDept._count.tickets)} {labels.TICKET_COUNT}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/faq?departmentId=${departmentId}&subDepartmentId=${subDept.id}`}
                  >
                    <Button variant="outline" size="sm" className="flex-1">
                      <HelpCircle className="ml-1 h-4 w-4" />
                      پرسش و پاسخ
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Sub Department Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={onCreateDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{buttons.NEW_SUB_DEPARTMENT}</DialogTitle>
            <DialogDescription>
              {descriptions.SUB_DEPARTMENT_CREATE_DESCRIPTION}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{labels.SUB_DEPARTMENT_NAME}</Label>
              <Input
                placeholder={labels.SUB_DEPARTMENT_NEW}
                value={newSubDepartmentName}
                onChange={(e) => onNewSubDepartmentNameChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onCreateConfirm()}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onCreateDialogClose}>
              {buttons.CANCEL}
            </Button>
            <Button
              onClick={onCreateConfirm}
              disabled={isSubmitting || !newSubDepartmentName.trim()}
            >
              {buttons.ADD}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Sub Department Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={onEditDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{descriptions.SUB_DEPARTMENT_EDIT_DESCRIPTION}</DialogTitle>
            <DialogDescription>
              {descriptions.SUB_DEPARTMENT_CREATE_DESCRIPTION}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{labels.SUB_DEPARTMENT_NAME}</Label>
              <Input
                placeholder={labels.SUB_DEPARTMENT_NEW}
                value={editSubDepartmentName}
                onChange={(e) => onEditSubDepartmentNameChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onEditConfirm()}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onEditDialogClose}>
              {buttons.CANCEL}
            </Button>
            <Button
              onClick={onEditConfirm}
              disabled={isSubmitting || !editSubDepartmentName.trim()}
            >
              {buttons.SAVE}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Sub Department Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={onDeleteDialogClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{buttons.DELETE_SUB_DEPARTMENT}</AlertDialogTitle>
            <AlertDialogDescription>
              آیا مطمئن هستید که می‌خواهید ساب‌دپارتمان &quot;
              {selectedSubDepartment?.name}&quot; را حذف کنید؟
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
            >
              {buttons.DELETE}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
