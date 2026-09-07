"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Building, Building2, HelpCircle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { labels, titles, buttons } from "@/lib/strings";
import { WizardStepDepartment } from "./wizard-step-department";
import { WizardStepSubDepartment } from "./wizard-step-sub-department";
import { WizardStepFAQ } from "./wizard-step-faq";
import { WizardStepForm } from "./wizard-step-form";
import { DepartmentWithCount, SubDepartmentWithCount, FAQItem, Attachment } from "@/types/shared";
import { useUser } from "@/contexts/user-context";
import { useDepartments, useSubDepartments, useFaqs, useCreateTicket } from "@/hooks";

const STEPS = [
  { id: 1, title: labels.SELECT_DEPARTMENT, icon: Building2 },
  { id: 2, title: labels.SELECT_SUB_DEPARTMENT, icon: Building },
  { id: 3, title: titles.FAQ, icon: HelpCircle },
  { id: 4, title: buttons.CREATE_TICKET, icon: MessageSquare },
];

export function WizardManager() {
  const router = useRouter();
  const { user } = useUser();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentWithCount | null>(null);
  const [selectedSubDepartment, setSelectedSubDepartment] = useState<SubDepartmentWithCount | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const { data: departments = [], isLoading: isLoadingDepartments } = useDepartments();
  const { data: subDepartments = [], isLoading: isLoadingSubDepartments } = useSubDepartments(
    selectedDepartment?.id ?? 0
  );
  const { data: faqs = [], isLoading: isLoadingFaqs } = useFaqs(
    selectedDepartment && selectedSubDepartment
      ? { departmentId: String(selectedDepartment.id), subDepartmentId: String(selectedSubDepartment.id) }
      : undefined
  );

  const createTicketMutation = useCreateTicket();

  const isLoading = isLoadingDepartments || isLoadingSubDepartments || isLoadingFaqs;

  const handleDepartmentSelect = (dept: DepartmentWithCount) => {
    setSelectedDepartment(dept);
    setSelectedSubDepartment(null);
    setCurrentStep(2);
  };

  const handleSubDepartmentSelect = (subDept: SubDepartmentWithCount) => {
    setSelectedSubDepartment(subDept);
    setCurrentStep(3);
  };

  const handleFaqComplete = () => {
    setCurrentStep(4);
  };

  const handleFileUpload = (file: Attachment) => {
    setAttachments((prev) => [...prev, file]);
  };

  const handleFileRemove = (fileUrl: string) => {
    setAttachments((prev) => prev.filter((f) => f.fileUrl !== fileUrl));
  };

  const handleSubmit = () => {
    if (!subject.trim() || !message.trim()) {
      setError("لطفاً تمامی فیلدها را پر کنید");
      return;
    }

    setError(null);

    createTicketMutation.mutate(
      {
        userName: user ? `${user.firstName} ${user.lastName}` : "",
        subject: subject.trim(),
        message: message.trim(),
        departmentId: String(selectedDepartment?.id),
        subDepartmentId: String(selectedSubDepartment?.id),
        userId: user?.id,
        attachments: attachments.length > 0 ? attachments : undefined,
      },
      {
        onSuccess: (ticket) => {
          router.push(`/user/tickets/${ticket.ticketId}`);
        },
        onError: (err) => {
          setError(err.message || "خطا در ایجاد تیکت");
        },
      }
    );
  };

  const renderStepIndicator = () => (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = currentStep === step.id;
          const isCompleted = currentStep > step.id;

          return (
            <div key={step.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors",
                    isActive && "border-primary/80 bg-primary/80 text-primary-foreground",
                    isCompleted && "border-primary bg-primary text-white",
                    !isActive && !isCompleted && "border-muted-foreground/30"
                  )}
                >
                  {isCompleted ? (
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <span
                  className={cn(
                    "mt-2 text-xs font-medium",
                    isActive && "text-primary",
                    isCompleted && "text-sky-800",
                    !isActive && !isCompleted && "text-muted-foreground"
                  )}
                >
                  {step.title}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-2 h-0.5 w-12 sm:w-20",
                    currentStep > step.id ? "bg-sky-600" : "bg-muted-foreground/30"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl">
      {renderStepIndicator()}

      <Card>
        <CardContent className="p-6">
          {currentStep === 1 && (
            <WizardStepDepartment
              departments={departments}
              isLoading={isLoadingDepartments}
              selectedDepartmentId={selectedDepartment?.id ?? null}
              onSelect={handleDepartmentSelect}
            />
          )}
          {currentStep === 2 && (
            <WizardStepSubDepartment
              subDepartments={subDepartments}
              isLoading={isLoadingSubDepartments}
              selectedDepartmentName={selectedDepartment?.name ?? ""}
              selectedSubDepartmentId={selectedSubDepartment?.id ?? null}
              onSelect={handleSubDepartmentSelect}
              onBack={() => setCurrentStep(1)}
              onSkip={() => setCurrentStep(4)}
            />
          )}
          {currentStep === 3 && (
            <WizardStepFAQ
              faqs={faqs}
              isLoading={isLoadingFaqs}
              departmentName={selectedDepartment?.name ?? ""}
              subDepartmentName={selectedSubDepartment?.name}
              onBack={() => setCurrentStep(2)}
              onComplete={handleFaqComplete}
            />
          )}
          {currentStep === 4 && (
            <WizardStepForm
              subject={subject}
              message={message}
              attachments={attachments}
              departmentName={selectedDepartment?.name ?? ""}
              subDepartmentName={selectedSubDepartment?.name}
              isLoading={createTicketMutation.isPending}
              error={error}
              onSubjectChange={setSubject}
              onMessageChange={setMessage}
              onFileUpload={handleFileUpload}
              onFileRemove={handleFileRemove}
              onSubmit={handleSubmit}
              onBack={() => setCurrentStep(3)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
