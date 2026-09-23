import { connection } from "next/server";
import { CustomerDashboard } from "@/components/customer-v2/customer-dashboard";
import { LegacyUserDashboard } from "@/components/shared/legacy-user-dashboard";
import { isCustomerExperienceV2Enabled } from "@/lib/feature-flags";

export default async function UserPage() {
  await connection();
  return isCustomerExperienceV2Enabled() ? (
    <CustomerDashboard />
  ) : (
    <LegacyUserDashboard />
  );
}
