"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { labels, buttons, errors, titles } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";
import { PredefinedMessage } from "@/types/ticket";
import { useMessages, useCreateMessage, useUpdateMessage, useDeleteMessage, useAllSubDepartments } from "@/hooks";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { predefinedMessageSchema, PredefinedMessageInput } from "@/lib/validations";
import { toast } from "sonner";
import { MessageList } from "./message-list";
import { MessageForm } from "./message-form";

export function MessageManager() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<PredefinedMessage | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const {
    register: registerCreate,
    handleSubmit: handleSubmitCreate,
    control: controlCreate,
    reset: resetCreate,
    formState: { errors: errorsCreate },
  } = useForm<PredefinedMessageInput>({
    resolver: zodResolver(predefinedMessageSchema),
  });

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    control: controlEdit,
    reset: resetEdit,
    formState: { errors: errorsEdit },
  } = useForm<PredefinedMessageInput>({
    resolver: zodResolver(predefinedMessageSchema),
  });

  const { data: messages = [], isLoading } = useMessages();
  const { data: allSubDepartments = [] } = useAllSubDepartments();
  const createMessageMutation = useCreateMessage();
  const updateMessageMutation = useUpdateMessage();
  const deleteMessageMutation = useDeleteMessage();

  const categories = [
    { id: "all", name: labels.ALL_CATEGORIES },
    { id: "general", name: labels.GENERAL },
    ...allSubDepartments.map((sd) => ({ id: sd.id.toString(), name: sd.name })),
  ];

  const filteredMessages =
    filterCategory === "all"
      ? messages
      : filterCategory === "general"
        ? messages.filter((m) => !m.subDepartmentId)
        : messages.filter(
            (m) => m.subDepartmentId === parseInt(filterCategory),
          );

  const handleCreate = async (data: PredefinedMessageInput) => {
    createMessageMutation.mutate(
      {
        title: data.title.trim(),
        content: data.content.trim(),
        shortCode: data.shortCode.trim(),
        subDepartmentId: data.subDepartmentId ?? null,
      },
      {
        onSuccess: () => {
          toast.success("پیام پیش‌فرض با موفقیت ایجاد شد");
          setIsCreateDialogOpen(false);
          resetCreate();
        },
        onError: (err) => {
          toast.error(err.message || errors.CREATE_MESSAGE);
        },
      }
    );
  };

  const handleEdit = async (data: PredefinedMessageInput) => {
    if (!selectedMessage) return;

    updateMessageMutation.mutate(
      {
        id: Number(selectedMessage.id),
        data: {
          title: data.title.trim(),
          content: data.content.trim(),
          shortCode: data.shortCode.trim(),
          subDepartmentId: data.subDepartmentId ?? null,
        },
      },
      {
        onSuccess: () => {
          toast.success("پیام پیش‌فرض با موفقیت ویرایش شد");
          setIsEditDialogOpen(false);
          setSelectedMessage(null);
          resetEdit();
        },
        onError: (err) => {
          toast.error(err.message || errors.UPDATE_MESSAGE);
        },
      }
    );
  };

  const handleDelete = async () => {
    if (!selectedMessage) return;

    deleteMessageMutation.mutate(Number(selectedMessage.id), {
      onSuccess: () => {
        toast.success("پیام پیش‌فرض با موفقیت حذف شد");
        setIsDeleteDialogOpen(false);
        setSelectedMessage(null);
      },
      onError: (err) => {
        toast.error(err.message || errors.DELETE_MESSAGE);
      },
    });
  };

  const openCreateDialog = () => {
    resetCreate();
    setIsCreateDialogOpen(true);
  };

  const openEditDialog = (msg: PredefinedMessage) => {
    setSelectedMessage(msg);
    resetEdit({
      title: msg.title,
      content: msg.content,
      shortCode: msg.shortCode,
      subDepartmentId: msg.subDepartmentId ?? undefined,
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (msg: PredefinedMessage) => {
    setSelectedMessage(msg);
    setIsDeleteDialogOpen(true);
  };

  const handleCopyShortcode = (shortCode: string, id: string) => {
    navigator.clipboard.writeText(`{${shortCode}}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{titles.PREDEFINED_MESSAGES}</h1>
          <p className="text-muted-foreground">
            {toPersianDigits(messages.length)} پیام پیش‌فرض
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="ml-2 h-4 w-4" />
          {buttons.NEW_MESSAGE}
        </Button>
      </div>

      <MessageForm
        isCreateDialogOpen={isCreateDialogOpen}
        isEditDialogOpen={isEditDialogOpen}
        isDeleteDialogOpen={isDeleteDialogOpen}
        selectedMessageTitle={selectedMessage?.title ?? null}
        subDepartments={allSubDepartments}
        registerCreate={registerCreate}
        handleSubmitCreate={handleSubmitCreate}
        controlCreate={controlCreate}
        errorsCreate={errorsCreate}
        registerEdit={registerEdit}
        handleSubmitEdit={handleSubmitEdit}
        controlEdit={controlEdit}
        errorsEdit={errorsEdit}
        isCreatePending={createMessageMutation.isPending}
        isCreateError={createMessageMutation.isError}
        isUpdatePending={updateMessageMutation.isPending}
        isUpdateError={updateMessageMutation.isError}
        isDeletePending={deleteMessageMutation.isPending}
        onCreateSubmit={handleCreate}
        onEditSubmit={handleEdit}
        onDeleteConfirm={handleDelete}
        onCreateDialogClose={() => {
          setIsCreateDialogOpen(false);
          resetCreate();
        }}
        onEditDialogClose={() => {
          setIsEditDialogOpen(false);
          setSelectedMessage(null);
          resetEdit();
        }}
        onDeleteDialogClose={() => {
          setIsDeleteDialogOpen(false);
          setSelectedMessage(null);
        }}
      />

      <MessageList
        messages={messages}
        filteredMessages={filteredMessages}
        isLoading={isLoading}
        filterCategory={filterCategory}
        categories={categories}
        subDepartments={allSubDepartments}
        copiedId={copiedId}
        onFilterCategoryChange={setFilterCategory}
        onEdit={openEditDialog}
        onDelete={openDeleteDialog}
        onCopyShortcode={handleCopyShortcode}
        onCreateFirst={openCreateDialog}
      />
    </div>
  );
}
