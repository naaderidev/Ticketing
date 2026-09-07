"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileUpload } from "@/components/shared/file-upload";
import { ArrowRight, Send } from "lucide-react";
import { labels, titles, descriptions, buttons, placeholders, misc } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";

interface Attachment {
  fileName: string;
  fileSize: number;
  fileType: string;
  fileUrl: string;
}

interface WizardStepFormProps {
  subject: string;
  message: string;
  attachments: Attachment[];
  departmentName: string;
  subDepartmentName?: string;
  isLoading: boolean;
  error: string | null;
  onSubjectChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onFileUpload: (file: Attachment) => void;
  onFileRemove: (fileUrl: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export function WizardStepForm({
  subject,
  message,
  attachments,
  departmentName,
  subDepartmentName,
  isLoading,
  error,
  onSubjectChange,
  onMessageChange,
  onFileUpload,
  onFileRemove,
  onSubmit,
  onBack,
}: WizardStepFormProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold">{titles.CREATE_TICKET}</h3>
        <p className="text-sm text-muted-foreground">
          {descriptions.TICKET_CREATE_DESCRIPTION}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{labels.TICKET_DEPARTMENT_SELECT}</Label>
          <Input value={departmentName} disabled />
        </div>
        {subDepartmentName && (
          <div className="space-y-2">
            <Label>{labels.TICKET_SUB_DEPARTMENT_SELECT}</Label>
            <Input value={subDepartmentName} disabled />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">{labels.TICKET_SUBJECT_LABEL}</Label>
        <Input
          id="subject"
          placeholder={placeholders.TICKET_SUBJECT}
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">{labels.TICKET_MESSAGE_LABEL}</Label>
        <Textarea
          id="message"
          placeholder={placeholders.TICKET_MESSAGE}
          className="min-h-[150px]"
          value={message}
          onChange={(e) => {
            if (e.target.value.length <= 1000) {
              onMessageChange(e.target.value);
            }
          }}
          maxLength={1000}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{toPersianDigits(message.length)} / ۱۰۰۰</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label>{labels.TICKET_ATTACHMENTS}</Label>
        <FileUpload onUpload={onFileUpload} onRemove={onFileRemove} files={attachments} />
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowRight className="ml-2 h-4 w-4" />
          {buttons.BACK}
        </Button>
        <Button
          onClick={onSubmit}
          disabled={isLoading || !subject.trim() || !message.trim()}
        >
          {isLoading ? (
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
    </div>
  );
}
