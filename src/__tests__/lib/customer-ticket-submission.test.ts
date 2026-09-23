import { getTicketSubmissionIssue } from "@/lib/customer-ticket-submission";

const completeInput = {
  subject: "پیگیری پرداخت",
  description: "پرداخت انجام شده اما وضعیت آن مشخص نیست.",
  requiresBusinessSubject: true,
  businessSubjectType: "PAYMENT",
  businessReferenceReady: true,
  businessReferenceIntegrationEnabled: true,
};

describe("getTicketSubmissionIssue", () => {
  it("explains that an external reference must be selected", () => {
    expect(
      getTicketSubmissionIssue({
        ...completeInput,
        businessReferenceReady: false,
      })
    ).toBe(
      "برای ثبت این درخواست، مرجع مرتبط را جست‌وجو کنید و یکی از نتایج را انتخاب کنید."
    );
  });

  it("prioritizes missing title and description messages", () => {
    expect(getTicketSubmissionIssue({ ...completeInput, subject: " " })).toBe(
      "عنوان درخواست را وارد کنید."
    );
    expect(
      getTicketSubmissionIssue({ ...completeInput, description: "" })
    ).toBe("شرح درخواست را وارد کنید.");
  });

  it("allows a complete request to be submitted", () => {
    expect(getTicketSubmissionIssue(completeInput)).toBeNull();
  });
});
