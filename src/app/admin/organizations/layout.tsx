import { requireAdminPageCapability } from "@/lib/admin-page-access";

export default async function OrganizationsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdminPageCapability("organizations");
  return children;
}
