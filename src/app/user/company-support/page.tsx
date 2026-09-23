import { connection } from "next/server";
import { CompanySupportPage } from "@/components/customer-v2/company-support-page";

export default async function UserCompanySupportPage() {
  await connection();
  return <CompanySupportPage />;
}
