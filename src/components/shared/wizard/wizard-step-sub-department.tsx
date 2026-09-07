"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { labels, titles, errors, buttons } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";
import { SubDepartmentWithCount } from "@/types/shared";

interface WizardStepSubDepartmentProps {
  subDepartments: SubDepartmentWithCount[];
  isLoading: boolean;
  selectedDepartmentName: string;
  selectedSubDepartmentId: number | null;
  onSelect: (subDept: SubDepartmentWithCount) => void;
  onBack: () => void;
  onSkip: () => void;
}

export function WizardStepSubDepartment({
  subDepartments,
  isLoading,
  selectedDepartmentName,
  selectedSubDepartmentId,
  onSelect,
  onBack,
  onSkip,
}: WizardStepSubDepartmentProps) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold">ساب‌دپارتمان را انتخاب کنید</h3>
        <div className="text-sm text-muted-foreground">
          دپارتمان: <Badge variant="secondary">{selectedDepartmentName}</Badge>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : subDepartments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Building2 className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p>{labels.EMPTY_SUB_DEPARTMENTS}</p>
          <Button variant="link" onClick={onSkip}>
            {buttons.CREATE_TICKET}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {subDepartments.map((subDept) => (
            <Card
              key={subDept.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
                selectedSubDepartmentId === subDept.id && "border-primary bg-primary/5"
              )}
              onClick={() => onSelect(subDept)}
            >
              <CardContent className="p-4">
                <h4 className="font-medium">{subDept.name}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {toPersianDigits(subDept._count.tickets)} {labels.TICKET_COUNT}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex justify-start">
        <Button variant="outline" onClick={onBack}>
          <ArrowRight className="ml-2 h-4 w-4" />
          بازگشت
        </Button>
      </div>
    </div>
  );
}
