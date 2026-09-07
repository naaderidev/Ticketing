"use client";

import { useState } from "react";
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
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  FolderOpen,
  Building,
} from "lucide-react";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { labels, buttons, errors, descriptions } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";
import { useDepartments, useCreateDepartment, useUpdateDepartment, useDeleteDepartment } from "@/hooks";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { departmentSchema, DepartmentInput } from "@/lib/validations";
import { toast } from "sonner";
import { DepartmentWithCount } from "@/types/shared";

export function DepartmentManager() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentWithCount | null>(null);

  const { data: rawDepartments = [], isLoading } = useDepartments();
  const departments = rawDepartments as unknown as DepartmentWithCount[];
  const createDepartmentMutation = useCreateDepartment();
  const updateDepartmentMutation = useUpdateDepartment();
  const deleteDepartmentMutation = useDeleteDepartment();

  const {
    register: registerCreate,
    handleSubmit: handleSubmitCreate,
    reset: resetCreate,
    formState: { errors: errorsCreate },
  } = useForm<DepartmentInput>({
    resolver: zodResolver(departmentSchema),
  });

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEdit,
    formState: { errors: errorsEdit },
  } = useForm<DepartmentInput>({
    resolver: zodResolver(departmentSchema),
  });

  const onCreateSubmit = async (data: DepartmentInput) => {
    createDepartmentMutation.mutate(data.name.trim(), {
      onSuccess: () => {
        toast.success("دپارتمان با موفقیت ایجاد شد");
        setIsCreateDialogOpen(false);
        resetCreate();
      },
      onError: (err) => {
        toast.error(err.message || errors.CREATE_DEPARTMENT);
      },
    });
  };

  const onEditSubmit = async (data: DepartmentInput) => {
    if (!selectedDepartment) return;

    updateDepartmentMutation.mutate(
      { id: selectedDepartment.id, name: data.name.trim() },
      {
        onSuccess: () => {
          toast.success("دپارتمان با موفقیت ویرایش شد");
          setIsEditDialogOpen(false);
          setSelectedDepartment(null);
          resetEdit();
        },
        onError: (err) => {
          toast.error(err.message || errors.UPDATE_DEPARTMENT);
        },
      }
    );
  };

  const handleDelete = async () => {
    if (!selectedDepartment) return;

    deleteDepartmentMutation.mutate(selectedDepartment.id, {
      onSuccess: () => {
        toast.success("دپارتمان با موفقیت حذف شد");
        setIsDeleteDialogOpen(false);
        setSelectedDepartment(null);
      },
      onError: (err) => {
        toast.error(err.message || errors.DELETE_DEPARTMENT);
      },
    });
  };

  const openEditDialog = (dept: DepartmentWithCount) => {
    setSelectedDepartment(dept);
    resetEdit({ name: dept.name });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (dept: DepartmentWithCount) => {
    setSelectedDepartment(dept);
    setIsDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{labels.NAV_DEPARTMENTS}</h1>
          <p className="text-muted-foreground">{toPersianDigits(departments.length)} دپارتمان</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="ml-2 h-4 w-4" />
          {buttons.NEW_DEPARTMENT}
        </Button>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : departments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="mb-2 h-8 w-8 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">{labels.EMPTY_DEPARTMENTS}</p>
            <Button
              variant="link"
              onClick={() => setIsCreateDialogOpen(true)}
              className="mt-2"
            >
              {labels.DEPARTMENT_FIRST}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {departments.map((dept) => (
            <Card key={dept.id} className="relative overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{dept.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditDialog(dept)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => openDeleteDialog(dept)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Building className="h-4 w-4" />
                    <span>{toPersianDigits(dept._count.subDepartments)} ساب‌دپارتمان</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <FolderOpen className="h-4 w-4" />
                    <span>{toPersianDigits(dept._count.tickets)} {labels.TICKET_COUNT}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a href={`/admin/departments/${dept.id}`} className="cursor-pointer">
                    <Button variant="outline" size="sm" className="flex-1">
                      <ChevronLeft className="ml-1 h-4 w-4" />
                      {labels.DEPARTMENT_MANAGE}
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{buttons.NEW_DEPARTMENT}</DialogTitle>
            <DialogDescription>
              {descriptions.DEPARTMENT_CREATE_DESCRIPTION}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitCreate(onCreateSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>{labels.DEPARTMENT_NAME}</Label>
              <Input
                placeholder={labels.DEPARTMENT_NEW}
                {...registerCreate("name")}
              />
              {errorsCreate.name && (
                <p className="text-destructive text-sm">{errorsCreate.name.message}</p>
              )}
            </div>
            {createDepartmentMutation.isError && (
              <p className="text-sm text-destructive">{errors.CREATE_DEPARTMENT}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  resetCreate();
                }}
              >
                {buttons.CANCEL}
              </Button>
              <Button
                type="submit"
                disabled={createDepartmentMutation.isPending}
              >
                {buttons.ADD}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{descriptions.DEPARTMENT_EDIT_DESCRIPTION}</DialogTitle>
            <DialogDescription>
              {descriptions.DEPARTMENT_CREATE_DESCRIPTION}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitEdit(onEditSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>{labels.DEPARTMENT_NAME}</Label>
              <Input
                placeholder={labels.DEPARTMENT_NEW}
                {...registerEdit("name")}
              />
              {errorsEdit.name && (
                <p className="text-destructive text-sm">{errorsEdit.name.message}</p>
              )}
            </div>
            {updateDepartmentMutation.isError && (
              <p className="text-sm text-destructive">{errors.UPDATE_DEPARTMENT}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setSelectedDepartment(null);
                  resetEdit();
                }}
              >
                {buttons.CANCEL}
              </Button>
              <Button
                type="submit"
                disabled={updateDepartmentMutation.isPending}
              >
                {buttons.SAVE}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{buttons.DELETE_DEPARTMENT}</AlertDialogTitle>
            <AlertDialogDescription>
              آیا مطمئن هستید که می‌خواهید دپارتمان &quot;
              {selectedDepartment?.name}&quot; را حذف کنید؟
              <br />
              <span className="text-destructive">
                این عمل غیرقابل بازگشت است.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{buttons.CANCEL}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteDepartmentMutation.isPending}
            >
              {buttons.DELETE}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
