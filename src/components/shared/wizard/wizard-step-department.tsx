"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { labels, titles, descriptions, errors } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";
import { DepartmentWithCount } from "@/types/shared";

interface WizardStepDepartmentProps {
  departments: DepartmentWithCount[];
  isLoading: boolean;
  selectedDepartmentId: number | null;
  onSelect: (dept: DepartmentWithCount) => void;
}

export function WizardStepDepartment({
  departments,
  isLoading,
  selectedDepartmentId,
  onSelect,
}: WizardStepDepartmentProps) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold">{titles.WIZARD_CHOOSE_DEPARTMENT}</h3>
        <p className="text-sm text-muted-foreground">
          {descriptions.TICKET_CREATE_DESCRIPTION}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : departments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Building2 className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p>{labels.EMPTY_DEPARTMENTS}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {departments.map((dept) => (
            <Card
              key={dept.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
                selectedDepartmentId === dept.id && "border-primary bg-primary/5"
              )}
              onClick={() => onSelect(dept)}
            >
              <CardContent className="p-4">
                <h4 className="font-medium">{dept.name}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {toPersianDigits(dept._count.tickets)} {labels.TICKET_COUNT}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
