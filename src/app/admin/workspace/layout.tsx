import { requireAdminPageCapability } from "@/lib/admin-page-access";

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdminPageCapability("workspace");
  return children;
}
