"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { labels, buttons, errors, titles } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";
import { useFaqs, useCreateFaq, useUpdateFaq, useDeleteFaq, useReorderFaqs, useDepartments, useSubDepartments } from "@/hooks";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { faqSchema, FaqInput } from "@/lib/validations";
import { toast } from "sonner";
import { FAQList } from "./faq-list";
import { FAQForm } from "./faq-form";

export function FAQManager() {
  const searchParams = useSearchParams();
  const initialDeptId = searchParams.get("departmentId") || "";
  const initialSubDeptId = searchParams.get("subDepartmentId") || "";

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedFAQ, setSelectedFAQ] = useState<{ id: number; question: string; answer: string; departmentId: number; subDepartmentId: number | null } | null>(null);

  const [filterDepartmentId, setFilterDepartmentId] = useState(initialDeptId);
  const [filterSubDepartmentId, setFilterSubDepartmentId] = useState(initialSubDeptId);

  const {
    register: registerCreate,
    handleSubmit: handleSubmitCreate,
    watch: watchCreate,
    setValue: setValueCreate,
    reset: resetCreate,
    formState: { errors: errorsCreate },
  } = useForm<FaqInput>({
    resolver: zodResolver(faqSchema),
    defaultValues: {
      departmentId: initialDeptId,
      subDepartmentId: initialSubDeptId,
    },
  });

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    watch: watchEdit,
    reset: resetEdit,
    formState: { errors: errorsEdit },
  } = useForm<FaqInput>({
    resolver: zodResolver(faqSchema),
  });

  const { data: departments = [] } = useDepartments();
  const { data: filterSubDepartments = [] } = useSubDepartments(
    filterDepartmentId ? Number.parseInt(filterDepartmentId) : 0
  );
  const { data: formSubDepartments = [] } = useSubDepartments(
    watchCreate("departmentId") ? Number.parseInt(watchCreate("departmentId")) : 0
  );
  const { data: faqs = [], isLoading } = useFaqs({
    departmentId: filterDepartmentId || undefined,
    subDepartmentId: filterSubDepartmentId || undefined,
  });
  const createFaqMutation = useCreateFaq();
  const updateFaqMutation = useUpdateFaq();
  const deleteFaqMutation = useDeleteFaq();
  const reorderFaqsMutation = useReorderFaqs();

  const handleCreate = async (data: FaqInput) => {
    createFaqMutation.mutate(
      {
        question: data.question.trim(),
        answer: data.answer.trim(),
        departmentId: data.departmentId,
        subDepartmentId: data.subDepartmentId || undefined,
      },
      {
        onSuccess: () => {
          toast.success("پرسش و پاسخ با موفقیت ایجاد شد");
          setIsCreateDialogOpen(false);
          resetCreate();
        },
        onError: (err) => {
          toast.error(err.message || errors.CREATE_FAQ);
        },
      }
    );
  };

  const handleEdit = async (data: FaqInput) => {
    if (!selectedFAQ) return;

    updateFaqMutation.mutate(
      {
        id: selectedFAQ.id,
        data: {
          question: data.question.trim(),
          answer: data.answer.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success("پرسش و پاسخ با موفقیت ویرایش شد");
          setIsEditDialogOpen(false);
          setSelectedFAQ(null);
          resetEdit();
        },
        onError: (err) => {
          toast.error(err.message || errors.UPDATE_FAQ);
        },
      }
    );
  };

  const handleDelete = async () => {
    if (!selectedFAQ) return;

    deleteFaqMutation.mutate(selectedFAQ.id, {
      onSuccess: () => {
        toast.success("پرسش و پاسخ با موفقیت حذف شد");
        setIsDeleteDialogOpen(false);
        setSelectedFAQ(null);
      },
      onError: (err) => {
        toast.error(err.message || errors.DELETE_FAQ);
      },
    });
  };

  const handleMoveUp = async (faq: { id: number; priority: number }) => {
    const index = faqs.findIndex((f) => f.id === faq.id);
    if (index <= 0) return;

    const newFaqs = [...faqs];
    const temp = newFaqs[index];
    newFaqs[index] = newFaqs[index - 1];
    newFaqs[index - 1] = temp;

    reorderFaqsMutation.mutate([
      { id: newFaqs[index].id, priority: index + 1 },
      { id: newFaqs[index - 1].id, priority: index },
    ]);
  };

  const handleMoveDown = async (faq: { id: number; priority: number }) => {
    const index = faqs.findIndex((f) => f.id === faq.id);
    if (index >= faqs.length - 1) return;

    const newFaqs = [...faqs];
    const temp = newFaqs[index];
    newFaqs[index] = newFaqs[index + 1];
    newFaqs[index + 1] = temp;

    reorderFaqsMutation.mutate([
      { id: newFaqs[index].id, priority: index + 1 },
      { id: newFaqs[index + 1].id, priority: index + 2 },
    ]);
  };

  const openCreateDialog = () => {
    resetCreate({
      question: "",
      answer: "",
      departmentId: filterDepartmentId,
      subDepartmentId: filterSubDepartmentId,
    });
    setIsCreateDialogOpen(true);
  };

  const openEditDialog = (faq: { id: number; question: string; answer: string; departmentId: number; subDepartmentId: number | null }) => {
    setSelectedFAQ(faq);
    resetEdit({
      question: faq.question,
      answer: faq.answer,
      departmentId: faq.departmentId.toString(),
      subDepartmentId: faq.subDepartmentId?.toString() || "",
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (faq: { id: number; question: string; answer: string; departmentId: number; subDepartmentId: number | null }) => {
    setSelectedFAQ(faq);
    setIsDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{titles.FAQ}</h1>
          <p className="text-muted-foreground">{toPersianDigits(faqs.length)} پرسش و پاسخ</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="ml-2 h-4 w-4" />
          {buttons.NEW_FAQ}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{labels.FILTER_SEARCH_TITLE}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">{labels.FILTER_DEPARTMENT}</label>
              <Select
                value={filterDepartmentId}
                onValueChange={setFilterDepartmentId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={labels.FILTER_ALL_DEPARTMENTS} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{labels.FILTER_ALL_DEPARTMENTS}</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id.toString()}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{labels.FILTER_SUB_DEPARTMENT}</label>
              <Select
                value={filterSubDepartmentId}
                onValueChange={setFilterSubDepartmentId}
                disabled={!filterDepartmentId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={labels.FILTER_ALL_SUB_DEPARTMENTS} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{labels.FILTER_ALL_SUB_DEPARTMENTS}</SelectItem>
                  {filterSubDepartments.map((subDept) => (
                    <SelectItem key={subDept.id} value={subDept.id.toString()}>
                      {subDept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <FAQList
        faqs={faqs}
        isLoading={isLoading}
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
        onEdit={openEditDialog}
        onDelete={openDeleteDialog}
        onCreateFirst={openCreateDialog}
        isReorderPending={reorderFaqsMutation.isPending}
      />

      <FAQForm
        isCreateDialogOpen={isCreateDialogOpen}
        isEditDialogOpen={isEditDialogOpen}
        isDeleteDialogOpen={isDeleteDialogOpen}
        departments={departments}
        formSubDepartments={formSubDepartments}
        registerCreate={registerCreate}
        handleSubmitCreate={handleSubmitCreate}
        watchCreate={watchCreate}
        errorsCreate={errorsCreate}
        registerEdit={registerEdit}
        handleSubmitEdit={handleSubmitEdit}
        watchEdit={watchEdit}
        errorsEdit={errorsEdit}
        isCreatePending={createFaqMutation.isPending}
        isCreateError={createFaqMutation.isError}
        isUpdatePending={updateFaqMutation.isPending}
        isUpdateError={updateFaqMutation.isError}
        isDeletePending={deleteFaqMutation.isPending}
        onCreateSubmit={handleCreate}
        onEditSubmit={handleEdit}
        onDeleteConfirm={handleDelete}
        onCreateDialogClose={() => {
          setIsCreateDialogOpen(false);
          resetCreate();
        }}
        onEditDialogClose={() => {
          setIsEditDialogOpen(false);
          setSelectedFAQ(null);
          resetEdit();
        }}
        onDeleteDialogClose={() => {
          setIsDeleteDialogOpen(false);
          setSelectedFAQ(null);
        }}
        onCreateDeptChange={(val) => setValueCreate("departmentId", val)}
        onCreateSubDeptChange={(val) => setValueCreate("subDepartmentId", val)}
        locked={!!initialDeptId}
      />
    </div>
  );
}
