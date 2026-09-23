import { requireAdminPageCapability } from "@/lib/admin-page-access";

export default async function KnowledgeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdminPageCapability("knowledge");
  return children;
}
