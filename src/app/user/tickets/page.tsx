import { connection } from "next/server";
import { CustomerTicketList } from "@/components/customer-v2/customer-ticket-list";
import { UserTicketList } from "@/components/shared/user-ticket-list";
import { isCustomerExperienceV2Enabled } from "@/lib/feature-flags";

export default async function UserTicketsPage() {
  await connection();
  return isCustomerExperienceV2Enabled() ? (
    <CustomerTicketList />
  ) : (
    <UserTicketList />
  );
}
