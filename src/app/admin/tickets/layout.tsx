import { requireAdminPageCapability } from "@/lib/admin-page-access";

export default async function TicketsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdminPageCapability("workspace");
  return children;
}
