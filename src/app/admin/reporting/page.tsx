import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ReportingDashboard } from "@/components/reporting/reporting-dashboard";
import { getCurrentUser } from "@/lib/current-user";
import { isReportingApiEnabled } from "@/lib/feature-flags";
import { isReportingActorAllowedInRollout } from "@/lib/reporting-rollout-config";
import { getReportingAccessCapabilities } from "@/modules/reporting/application/reporting-authorization";

export default async function AdminReportingPage() {
  await connection();
  if (!isReportingApiEnabled()) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/user/login?redirect=/admin/reporting");
  if (user.role !== "ADMIN") redirect("/forbidden");
  if (!isReportingActorAllowedInRollout(user.id)) redirect("/forbidden");

  const access = await getReportingAccessCapabilities(user.id);
  if (!access) redirect("/forbidden");

  return <ReportingDashboard access={access} />;
}
