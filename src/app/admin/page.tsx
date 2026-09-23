import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getFrontendAccessProfile } from "@/lib/frontend-access";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/user/login?redirect=/admin");
  if (user.role !== "ADMIN") redirect("/forbidden");

  const access = await getFrontendAccessProfile(user.id);
  redirect(access.isStaff ? access.defaultHref : "/forbidden");
}
