type TicketSubmissionReadiness = {
  subject: string;
  description: string;
  requiresBusinessSubject: boolean;
  businessSubjectType: string | null;
  businessReferenceReady: boolean;
  businessReferenceIntegrationEnabled: boolean;
};

const EXTERNAL_BUSINESS_SUBJECTS = new Set([
  "CONTRACT",
  "INVOICE",
  "PAYMENT",
  "SETTLEMENT",
  "POWER_PLANT",
  "METER",
  "SAVING_PROGRAM",
]);

export function getTicketSubmissionIssue(
  input: TicketSubmissionReadiness
): string | null {
  if (!input.subject.trim()) return "عنوان درخواست را وارد کنید.";
  if (!input.description.trim()) return "شرح درخواست را وارد کنید.";
  if (!input.requiresBusinessSubject || input.businessReferenceReady) return null;

  if (input.businessSubjectType === "ORGANIZATION_MEMBERSHIP") {
    return "برای ثبت این درخواست، ابتدا یک شرکت مجاز را از بالای صفحه انتخاب کنید.";
  }
  if (input.businessSubjectType === "RELATED_TICKET") {
    return "برای ثبت این درخواست، تیکت مرتبط را انتخاب کنید.";
  }
  if (EXTERNAL_BUSINESS_SUBJECTS.has(input.businessSubjectType ?? "")) {
    if (!input.businessReferenceIntegrationEnabled) {
      return "سرویس مرجع این نوع درخواست در دسترس نیست؛ لطفاً بعداً دوباره تلاش کنید.";
    }
    return "برای ثبت این درخواست، مرجع مرتبط را جست‌وجو کنید و یکی از نتایج را انتخاب کنید.";
  }
  return "اطلاعات مرتبط الزامی این درخواست را کامل کنید.";
}
