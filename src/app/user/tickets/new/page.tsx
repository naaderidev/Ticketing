import { connection } from "next/server";
import { CustomerTicketCreate } from "@/components/customer-v2/customer-ticket-create";
import { TicketWizard } from "@/components/shared/ticket-wizard";
import {
  isBusinessReferenceIntegrationEnabled,
  isCustomerExperienceV2Enabled,
} from "@/lib/feature-flags";

type SearchParams = Promise<{
  journeyId?: string | string[];
  requestTypeId?: string | string[];
  subject?: string | string[];
}>;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function NewTicketPage({
  searchParams,
}: Readonly<{ searchParams: SearchParams }>) {
  await connection();
  const query = await searchParams;
  const rawJourneyId = single(query.journeyId);
  const rawRequestTypeId = single(query.requestTypeId);
  const rawSubject = single(query.subject)?.trim();
  const initialSupportJourneyId =
    rawJourneyId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      rawJourneyId
    )
      ? rawJourneyId
      : undefined;
  const parsedRequestTypeId = rawRequestTypeId ? Number(rawRequestTypeId) : NaN;
  const initialRequestTypeId =
    Number.isSafeInteger(parsedRequestTypeId) && parsedRequestTypeId > 0
      ? parsedRequestTypeId
      : undefined;
  const initialSubject = rawSubject ? rawSubject.slice(0, 200) : undefined;
  const useCustomerExperience = isCustomerExperienceV2Enabled();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {useCustomerExperience ? "درخواست جدید" : "تیکت جدید"}
        </h1>
        <p className="text-muted-foreground">
          {useCustomerExperience
            ? "خدمت و نوع درخواست را انتخاب کنید تا درخواست درست مسیریابی شود."
            : "ایجاد تیکت پشتیبانی جدید"}
        </p>
      </div>
      {useCustomerExperience ? (
        <CustomerTicketCreate
          businessReferenceIntegrationEnabled={isBusinessReferenceIntegrationEnabled()}
          initialSupportJourneyId={initialSupportJourneyId}
          initialRequestTypeId={initialRequestTypeId}
          initialSubject={initialSubject}
        />
      ) : (
        <TicketWizard />
      )}
    </div>
  );
}
