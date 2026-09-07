"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Building2, FolderOpen, Plus } from "lucide-react";
import { labels, buttons, errors } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";
import { DepartmentInfo } from "./department-info";
import { DepartmentSubDepartments } from "./department-sub-departments";
import { toast } from "sonner";
import { SubDepartmentWithCount } from "@/types/shared";
import { useDepartment, useSubDepartments, useCreateSubDepartment, useUpdateSubDepartment, useDeleteSubDepartment, useUpdateDepartment } from "@/hooks";

export function DepartmentManager() {
  const params = useParams();
  const departmentId = params.id as string;
  const numericDepartmentId = parseInt(departmentId);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedSubDepartment, setSelectedSubDepartment] = useState<SubDepartmentWithCount | null>(null);
  const [newSubDepartmentName, setNewSubDepartmentName] = useState("");
  const [editSubDepartmentName, setEditSubDepartmentName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [isEditDeptDialogOpen, setIsEditDeptDialogOpen] = useState(false);
  const [editDeptName, setEditDeptName] = useState("");

  const { data: department, isLoading: isLoadingDepartment } = useDepartment(numericDepartmentId);
  const { data: subDepartments = [], isLoading: isLoadingSubDepartments } = useSubDepartments(numericDepartmentId);

  const createSubDepartmentMutation = useCreateSubDepartment();
  const updateSubDepartmentMutation = useUpdateSubDepartment();
  const deleteSubDepartmentMutation = useDeleteSubDepartment();
  const updateDepartmentMutation = useUpdateDepartment();

  const isLoading = isLoadingDepartment || isLoadingSubDepartments;
  const isSubmitting = createSubDepartmentMutation.isPending || updateSubDepartmentMutation.isPending || deleteSubDepartmentMutation.isPending || updateDepartmentMutation.isPending;

  const handleCreateSubDepartment = async () => {
    if (!newSubDepartmentName.trim()) return;

    setError(null);

    createSubDepartmentMutation.mutate(
      { departmentId: numericDepartmentId, name: newSubDepartmentName.trim() },
      {
        onSuccess: () => {
          setIsCreateDialogOpen(false);
          setNewSubDepartmentName("");
          toast.success("ساب‌دپارتمان با موفقیت ایجاد شد");
        },
        onError: (err) => {
          setError(err.message || errors.CREATE_SUB_DEPARTMENT);
        },
      }
    );
  };

  const handleEditSubDepartment = async () => {
    if (!selectedSubDepartment || !editSubDepartmentName.trim()) return;

    setError(null);

    updateSubDepartmentMutation.mutate(
      { id: selectedSubDepartment.id, name: editSubDepartmentName.trim() },
      {
        onSuccess: () => {
          setIsEditDialogOpen(false);
          setSelectedSubDepartment(null);
          setEditSubDepartmentName("");
          toast.success("ساب‌دپارتمان با موفقیت بروزرسانی شد");
        },
        onError: (err) => {
          setError(err.message || errors.UPDATE_SUB_DEPARTMENT);
        },
      }
    );
  };

  const handleDeleteSubDepartment = async () => {
    if (!selectedSubDepartment) return;

    setError(null);

    deleteSubDepartmentMutation.mutate(
      { id: selectedSubDepartment.id, departmentId: numericDepartmentId },
      {
        onSuccess: () => {
          setIsDeleteDialogOpen(false);
          setSelectedSubDepartment(null);
          toast.success("ساب‌دپارتمان با موفقیت حذف شد");
        },
        onError: (err) => {
          toast.error(err.message || errors.DELETE_SUB_DEPARTMENT);
        },
      }
    );
  };

  const handleEditDepartment = async () => {
    if (!editDeptName.trim()) return;

    setError(null);

    updateDepartmentMutation.mutate(
      { id: numericDepartmentId, name: editDeptName.trim() },
      {
        onSuccess: () => {
          setIsEditDeptDialogOpen(false);
          setEditDeptName("");
          toast.success("دپارتمان با موفقیت بروزرسانی شد");
        },
        onError: (err) => {
          setError(err.message || errors.UPDATE_DEPARTMENT);
        },
      }
    );
  };

  const openEditDialog = (subDept: SubDepartmentWithCount) => {
    setSelectedSubDepartment(subDept);
    setEditSubDepartmentName(subDept.name);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (subDept: SubDepartmentWithCount) => {
    setSelectedSubDepartment(subDept);
    setIsDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/departments">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{department?.name}</h1>
            <p className="text-muted-foreground flex items-center gap-1">
              <Building2 className="h-4 w-4" />{toPersianDigits(subDepartments.length)} ساب‌دپارتمان / <FolderOpen className="h-4 w-4" />{toPersianDigits(department?._count.tickets || 0)} {labels.TICKET_COUNT}
            </p>
          </div>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="ml-2 h-4 w-4" />
          {buttons.NEW_SUB_DEPARTMENT}
        </Button>
      </div>

      <DepartmentInfo
        department={department ?? null}
        isEditDialogOpen={isEditDeptDialogOpen}
        editDeptName={editDeptName}
        isSubmitting={isSubmitting}
        error={error}
        subDepartmentsCount={subDepartments.length}
        onEditClick={() => {
          setEditDeptName(department?.name ?? "");
          setIsEditDeptDialogOpen(true);
        }}
        onEditDialogClose={() => {
          setIsEditDeptDialogOpen(false);
          setError(null);
        }}
        onEditConfirm={handleEditDepartment}
        onEditDeptNameChange={setEditDeptName}
      />

      <DepartmentSubDepartments
        subDepartments={subDepartments}
        isLoading={isLoading}
        isCreateDialogOpen={isCreateDialogOpen}
        isEditDialogOpen={isEditDialogOpen}
        isDeleteDialogOpen={isDeleteDialogOpen}
        selectedSubDepartment={selectedSubDepartment}
        newSubDepartmentName={newSubDepartmentName}
        editSubDepartmentName={editSubDepartmentName}
        isSubmitting={isSubmitting}
        error={error}
        departmentId={departmentId}
        onOpenCreateDialog={() => setIsCreateDialogOpen(true)}
        onCreateDialogClose={() => {
          setIsCreateDialogOpen(false);
          setNewSubDepartmentName("");
          setError(null);
        }}
        onEditDialogClose={() => {
          setIsEditDialogOpen(false);
          setSelectedSubDepartment(null);
          setEditSubDepartmentName("");
          setError(null);
        }}
        onDeleteDialogClose={() => {
          setIsDeleteDialogOpen(false);
          setSelectedSubDepartment(null);
        }}
        onCreateConfirm={handleCreateSubDepartment}
        onEditConfirm={handleEditSubDepartment}
        onDeleteConfirm={handleDeleteSubDepartment}
        onNewSubDepartmentNameChange={setNewSubDepartmentName}
        onEditSubDepartmentNameChange={setEditSubDepartmentName}
        onEditClick={openEditDialog}
        onDeleteClick={openDeleteDialog}
      />
    </div>
  );
}
