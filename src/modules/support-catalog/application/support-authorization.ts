import { prisma } from "@/lib/prisma";

export const SUPPORT_PERMISSIONS = {
  CATALOG_READ: "support.catalog.read",
  CATALOG_MANAGE: "support.catalog.manage",
  TEAM_READ: "support.team.read",
  TEAM_MANAGE: "support.team.manage",
  QUEUE_READ: "support.queue.read",
  QUEUE_MANAGE: "support.queue.manage",
  ROUTING_MANAGE: "support.routing.manage",
  WORKSPACE_ACCESS: "support.workspace.access",
  TICKET_READ: "ticket.workspace.read",
  TICKET_ASSIGN: "ticket.workspace.assign",
  TICKET_TRANSFER: "ticket.workspace.transfer",
  TICKET_REPLY: "ticket.workspace.reply",
  TICKET_RESOLVE: "ticket.workspace.resolve",
} as const;

export async function hasGlobalSupportPermission(
  userId: number,
  permissionKey: string,
  now = new Date()
): Promise<boolean> {
  const assignment = await prisma.userRoleAssignment.findFirst({
    where: {
      userId,
      scopeType: "GLOBAL",
      scopeKey: "*",
      status: "ACTIVE",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
      role: {
        permissions: { some: { permission: { key: permissionKey } } },
      },
    },
    select: { id: true },
  });
  return assignment !== null;
}

export async function hasAnySupportPermission(
  userId: number,
  permissionKey: string,
  now = new Date()
): Promise<boolean> {
  const assignment = await prisma.userRoleAssignment.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
      role: {
        permissions: { some: { permission: { key: permissionKey } } },
      },
    },
    select: { id: true },
  });
  return assignment !== null;
}

export async function hasSupportTeamPermission(
  userId: number,
  supportTeamId: number,
  permissionKey: string,
  now = new Date()
): Promise<boolean> {
  const assignment = await prisma.userRoleAssignment.findFirst({
    where: {
      userId,
      supportTeamId,
      scopeType: "SUPPORT_TEAM",
      scopeKey: String(supportTeamId),
      status: "ACTIVE",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
      role: {
        permissions: { some: { permission: { key: permissionKey } } },
      },
    },
    select: { id: true },
  });
  return assignment !== null;
}
