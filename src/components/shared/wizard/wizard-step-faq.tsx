"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowRight, ArrowLeft, HelpCircle } from "lucide-react";
import { labels, buttons } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";

interface FAQ {
  id: number;
  question: string;
  answer: string;
  priority: number;
}

interface WizardStepFAQProps {
  faqs: FAQ[];
  isLoading: boolean;
  departmentName: string;
  subDepartmentName?: string;
  onBack: () => void;
  onComplete: () => void;
}

export function WizardStepFAQ({
  faqs,
  isLoading,
  departmentName,
  subDepartmentName,
  onBack,
  onComplete,
}: WizardStepFAQProps) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold">آیا پاسخ سوال خود را پیدا کردید؟</h3>
        <p className="text-sm text-muted-foreground">
          پرسش‌های متداول مرتبط با {departmentName}
          {subDepartmentName && ` / ${subDepartmentName}`}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : faqs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <HelpCircle className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p>پرسش و پاسخ متداولی وجود ندارد</p>
        </div>
      ) : (
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, index) => (
            <AccordionItem key={faq.id} value={`faq-${faq.id}`}>
              <AccordionTrigger className="text-right">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="shrink-0">
                    {toPersianDigits(index + 1)}
                  </Badge>
                  <span>{faq.question}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <div className="flex items-center justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowRight className="ml-2 h-4 w-4" />
          {buttons.BACK}
        </Button>
        <Button onClick={onComplete}>
          {labels.WIZARD_NO_ANSWER}
          <ArrowLeft className="mr-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
