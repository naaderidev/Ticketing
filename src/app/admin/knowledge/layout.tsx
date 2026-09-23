import { requireAdminPageCapability } from "@/lib/admin-page-access";

export default async function KnowledgeManagementLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdminPageCapability("knowledge");
  return children;
}
