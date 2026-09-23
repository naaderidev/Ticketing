import { requireAdminPageCapability } from "@/lib/admin-page-access";

export default async function UsersLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdminPageCapability("users");
  return children;
}
