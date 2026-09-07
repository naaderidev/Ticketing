"use client";

import { Card, CardContent } from "@/components/ui/card";
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
import { Building2, FolderOpen, Pencil } from "lucide-react";
import { labels, buttons, errors, descriptions } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";
import { DepartmentWithCount } from "@/types/shared";

interface DepartmentInfoProps {
  department: DepartmentWithCount | null;
  isEditDialogOpen: boolean;
  editDeptName: string;
  isSubmitting: boolean;
  error: string | null;
  subDepartmentsCount: number;
  onEditClick: () => void;
  onEditDialogClose: () => void;
  onEditConfirm: () => void;
  onEditDeptNameChange: (value: string) => void;
}

export function DepartmentInfo({
  department,
  isEditDialogOpen,
  editDeptName,
  isSubmitting,
  error,
  subDepartmentsCount,
  onEditClick,
  onEditDialogClose,
  onEditConfirm,
  onEditDeptNameChange,
}: DepartmentInfoProps) {
  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">{department?.name}</h2>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEditClick}>
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-muted-foreground flex items-center gap-1">
            <Building2 className="h-4 w-4" />{toPersianDigits(subDepartmentsCount)} ساب‌دپارتمان / <FolderOpen className="h-4 w-4" />{toPersianDigits(department?._count.tickets || 0)} {labels.TICKET_COUNT}
          </p>
        </CardContent>
      </Card>

      {/* Edit Department Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={onEditDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{descriptions.DEPARTMENT_EDIT_DESCRIPTION}</DialogTitle>
            <DialogDescription>
              {descriptions.DEPARTMENT_CREATE_DESCRIPTION}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{labels.DEPARTMENT_NAME}</Label>
              <Input
                placeholder={labels.DEPARTMENT_NEW}
                value={editDeptName}
                onChange={(e) => onEditDeptNameChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onEditConfirm()}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onEditDialogClose}>
              {buttons.CANCEL}
            </Button>
            <Button onClick={onEditConfirm} disabled={isSubmitting || !editDeptName.trim()}>
              {buttons.SAVE}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
