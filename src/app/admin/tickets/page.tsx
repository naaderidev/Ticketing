import { connection } from "next/server";
import { AdminTicketList } from "@/components/shared/admin-ticket-list";
import { WorkspaceTicketList } from "@/components/workspace-v2/workspace-ticket-list";
import { isAgentWorkspaceV2Enabled } from "@/lib/feature-flags";
import type { WorkspaceSlaStatus, WorkspaceTicketPriority, WorkspaceTicketStatus } from "@/types/workspace-ticket-v2";

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ queueId?: string; slaStatus?: string; status?: string; priority?: string; ownership?: string }>;
}) {
  await connection();
  if (!isAgentWorkspaceV2Enabled()) return <AdminTicketList />;
  const params = await searchParams;
  const rawQueueId = params.queueId;
  const queueId = rawQueueId && /^[1-9]\d*$/.test(rawQueueId) ? Number(rawQueueId) : undefined;
  const slaStatus = ["AT_RISK", "BREACHED", "PAUSED"].includes(params.slaStatus ?? "")
    ? params.slaStatus as WorkspaceSlaStatus
    : undefined;
  const status = ["NEW", "UNASSIGNED", "IN_PROGRESS", "INTERNAL_REFERRAL", "WAITING_INTERNAL", "WAITING_USER", "RESOLVED", "CLOSED", "REOPENED", "CLOSED_LEGACY"].includes(params.status ?? "")
    ? params.status as WorkspaceTicketStatus
    : undefined;
  const priority = ["CRITICAL", "HIGH", "NORMAL", "LOW"].includes(params.priority ?? "")
    ? params.priority as WorkspaceTicketPriority
    : undefined;
  const ownership = ["ALL", "MINE", "UNASSIGNED"].includes(params.ownership ?? "")
    ? params.ownership as "ALL" | "MINE" | "UNASSIGNED"
    : undefined;
  return <WorkspaceTicketList initialQueueId={queueId} initialSlaStatus={slaStatus} initialStatus={status} initialPriority={priority} initialOwnership={ownership} />;
}
