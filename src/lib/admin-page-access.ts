import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import {
  getFrontendAccessProfile,
  type AdminCapability,
} from "@/lib/frontend-access";

export async function requireAdminPageCapability(
  capability: AdminCapability,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/user/login?redirect=/admin");
  if (user.role !== "ADMIN") redirect("/forbidden");

  const access = await getFrontendAccessProfile(user.id);
  if (!access.isStaff || !access.capabilities[capability]) {
    redirect("/forbidden");
  }
}
