import { requireAdminPageCapability } from "@/lib/admin-page-access";

export default async function SupportCatalogLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdminPageCapability("supportCatalog");
  return children;
}
