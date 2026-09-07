"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { labels } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";

interface FAQ {
  id: number;
  question: string;
  answer: string;
  priority: number;
  departmentId: number;
  subDepartmentId: number | null;
  department: { name: string };
  subDepartment: { name: string } | null;
}

interface FAQListProps {
  faqs: FAQ[];
  isLoading: boolean;
  onMoveUp: (faq: { id: number; priority: number }) => void;
  onMoveDown: (faq: { id: number; priority: number }) => void;
  onEdit: (faq: FAQ) => void;
  onDelete: (faq: FAQ) => void;
  onCreateFirst: () => void;
  isReorderPending: boolean;
}

export function FAQList({
  faqs,
  isLoading,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
  onCreateFirst,
  isReorderPending,
}: FAQListProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (faqs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <HelpCircle className="mb-2 h-8 w-8 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">{labels.EMPTY_FAQS}</p>
          <Button variant="link" onClick={onCreateFirst} className="mt-2">
            {labels.FAQ_FIRST}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {faqs.map((faq, index) => (
        <Card key={faq.id}>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex flex-col gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onMoveUp(faq)}
                  disabled={index === 0 || isReorderPending}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onMoveDown(faq)}
                  disabled={index === faqs.length - 1 || isReorderPending}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="shrink-0">
                    {toPersianDigits(index + 1)}
                  </Badge>
                  <h3 className="font-medium">{faq.question}</h3>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {faq.answer}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{faq.department.name}</span>
                  {faq.subDepartment && (
                    <>
                      <span>/</span>
                      <span>{faq.subDepartment.name}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onEdit(faq)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => onDelete(faq)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
