import { connection } from "next/server";
import { AdminTicketDetail } from "@/components/shared/admin-ticket-detail"
import { WorkspaceTicketDetail } from "@/components/workspace-v2/workspace-ticket-detail";
import { isAgentWorkspaceV2Enabled } from "@/lib/feature-flags";

export default async function AdminTicketDetailPage({ params }: { params: Promise<{ ticketId: string }> }) {
  await connection();
  if (!isAgentWorkspaceV2Enabled()) return <AdminTicketDetail />;
  return <WorkspaceTicketDetail ticketId={(await params).ticketId} />;
}
