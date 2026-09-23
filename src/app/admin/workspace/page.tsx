import { connection } from "next/server";
import { notFound } from "next/navigation";
import { WorkspaceDashboard } from "@/components/workspace-v2/workspace-dashboard";
import { isAgentWorkspaceV2Enabled } from "@/lib/feature-flags";

export default async function AdminWorkspacePage() {
  await connection();
  if (!isAgentWorkspaceV2Enabled()) notFound();
  return <WorkspaceDashboard />;
}
