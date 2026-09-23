import { connection } from "next/server";
import { CustomerTicketDetail } from "@/components/customer-v2/customer-ticket-detail";
import { TicketDetail } from "@/components/shared/ticket-detail";
import { isCustomerExperienceV2Enabled } from "@/lib/feature-flags";

export default async function UserTicketDetailPage() {
  await connection();
  return isCustomerExperienceV2Enabled() ? (
    <CustomerTicketDetail />
  ) : (
    <TicketDetail mode="user" />
  );
}
