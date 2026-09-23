import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const REPORTING_PERMISSIONS = {
  READ_TEAM: "reporting.kpi.read.team",
  READ_GLOBAL: "reporting.kpi.read.global",
  AUDIT_READ: "reporting.kpi.audit.read",
  EXPORT: "reporting.kpi.export",
} as const;

export type ReportingAccessScope =
  | { type: "GLOBAL"; accessMode: "MANAGEMENT"; teamIds: null }
  | { type: "TEAMS"; accessMode: "MANAGEMENT"; teamIds: number[] }
  | { type: "GLOBAL"; accessMode: "AUDIT"; teamIds: null };

type ReportingAuthorizationClient = Pick<typeof prisma, "userRoleAssignment">;

const WORKSPACE_ACCESS_PERMISSION = "support.workspace.access";
const TICKET_READ_PERMISSION = "ticket.workspace.read";

export function reportingFactScopeWhere(
  scope: ReportingAccessScope
): Prisma.TicketReportingFactWhereInput {
  return scope.type === "TEAMS"
    ? { supportTeamId: { in: scope.teamIds } }
    : {};
}

export async function resolveReportingAccessScope(
  actorUserId: number,
  now = new Date(),
  client: ReportingAuthorizationClient = prisma
): Promise<ReportingAccessScope | null> {
  const assignments = await client.userRoleAssignment.findMany({
    where: {
      userId: actorUserId,
      status: "ACTIVE",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
      role: {
        permissions: {
          some: {
            permission: {
              key: { in: Object.values(REPORTING_PERMISSIONS) },
            },
          },
        },
      },
    },
    select: {
      scopeType: true,
      scopeKey: true,
      supportTeamId: true,
      role: {
        select: {
          permissions: {
            select: { permission: { select: { key: true } } },
          },
        },
      },
    },
  });

  let hasGlobalRead = false;
  let hasGlobalAuditRead = false;
  const teamIds = new Set<number>();

  for (const assignment of assignments) {
    const permissionKeys = new Set(
      assignment.role.permissions.map((grant) => grant.permission.key)
    );
    const isGlobalAssignment =
      assignment.scopeType === "GLOBAL" && assignment.scopeKey === "*";

    if (isGlobalAssignment && permissionKeys.has(REPORTING_PERMISSIONS.READ_GLOBAL)) {
      hasGlobalRead = true;
    }
    if (isGlobalAssignment && permissionKeys.has(REPORTING_PERMISSIONS.AUDIT_READ)) {
      hasGlobalAuditRead = true;
    }
    if (
      assignment.scopeType === "SUPPORT_TEAM" &&
      assignment.supportTeamId !== null &&
      assignment.scopeKey === String(assignment.supportTeamId) &&
      permissionKeys.has(REPORTING_PERMISSIONS.READ_TEAM)
    ) {
      teamIds.add(assignment.supportTeamId);
    }
  }

  if (hasGlobalRead) {
    return { type: "GLOBAL", accessMode: "MANAGEMENT", teamIds: null };
  }
  if (teamIds.size > 0) {
    return {
      type: "TEAMS",
      accessMode: "MANAGEMENT",
      teamIds: [...teamIds].sort((left, right) => left - right),
    };
  }
  if (hasGlobalAuditRead) {
    return { type: "GLOBAL", accessMode: "AUDIT", teamIds: null };
  }
  return null;
}

export async function hasReportingExportPermissionForScope(
  actorUserId: number,
  scope: ReportingAccessScope,
  now = new Date(),
  client: ReportingAuthorizationClient = prisma
): Promise<boolean> {
  const assignments = await client.userRoleAssignment.findMany({
    where: {
      userId: actorUserId,
      status: "ACTIVE",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
      role: {
        permissions: {
          some: { permission: { key: REPORTING_PERMISSIONS.EXPORT } },
        },
      },
    },
    select: {
      scopeType: true,
      scopeKey: true,
      supportTeamId: true,
    },
  });

  const hasGlobalExport = assignments.some(
    (assignment) =>
      assignment.scopeType === "GLOBAL" && assignment.scopeKey === "*"
  );
  if (hasGlobalExport) return true;
  if (scope.type === "GLOBAL") return false;

  const exportedTeamIds = new Set(
    assignments
      .filter(
        (assignment) =>
          assignment.scopeType === "SUPPORT_TEAM" &&
          assignment.supportTeamId !== null &&
          assignment.scopeKey === String(assignment.supportTeamId)
      )
      .map((assignment) => assignment.supportTeamId!)
  );
  return scope.teamIds.every((teamId) => exportedTeamIds.has(teamId));
}

export async function resolveReportingTicketDrillDownWhere(
  actorUserId: number,
  now = new Date(),
  client: ReportingAuthorizationClient = prisma
): Promise<Prisma.TicketReportingFactWhereInput | null> {
  const assignments = await client.userRoleAssignment.findMany({
    where: {
      userId: actorUserId,
      status: "ACTIVE",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
      role: {
        permissions: {
          some: {
            permission: {
              key: {
                in: [WORKSPACE_ACCESS_PERMISSION, TICKET_READ_PERMISSION],
              },
            },
          },
        },
      },
    },
    select: {
      scopeType: true,
      scopeKey: true,
      supportTeamId: true,
      role: {
        select: {
          permissions: {
            select: { permission: { select: { key: true } } },
          },
        },
      },
    },
  });

  let hasGlobalWorkspaceAccess = false;
  let hasGlobalTicketRead = false;
  const readableTeamIds = new Set<number>();
  for (const assignment of assignments) {
    const permissions = new Set(
      assignment.role.permissions.map((grant) => grant.permission.key)
    );
    const isGlobal =
      assignment.scopeType === "GLOBAL" && assignment.scopeKey === "*";
    if (isGlobal && permissions.has(WORKSPACE_ACCESS_PERMISSION)) {
      hasGlobalWorkspaceAccess = true;
    }
    if (isGlobal && permissions.has(TICKET_READ_PERMISSION)) {
      hasGlobalTicketRead = true;
    }
    if (
      assignment.scopeType === "SUPPORT_TEAM" &&
      assignment.supportTeamId !== null &&
      assignment.scopeKey === String(assignment.supportTeamId) &&
      permissions.has(TICKET_READ_PERMISSION)
    ) {
      readableTeamIds.add(assignment.supportTeamId);
    }
  }

  if (!hasGlobalWorkspaceAccess) return null;
  if (hasGlobalTicketRead) return {};
  if (readableTeamIds.size === 0) return null;
  const teamIds = [...readableTeamIds];
  return {
    ticket: {
      OR: [
        { supportTeamId: { in: teamIds } },
        {
          workItems: {
            some: { supportTeamId: { in: teamIds }, status: "OPEN" },
          },
        },
      ],
    },
  };
}

export async function getReportingAccessCapabilities(
  actorUserId: number,
  now = new Date()
) {
  const scope = await resolveReportingAccessScope(actorUserId, now);
  if (!scope) return null;
  const [canExport, ticketDrillDownWhere] = await Promise.all([
    hasReportingExportPermissionForScope(actorUserId, scope, now),
    scope.accessMode === "MANAGEMENT"
      ? resolveReportingTicketDrillDownWhere(actorUserId, now)
      : Promise.resolve(null),
  ]);
  return {
    scope,
    canExport,
    canDrillDown: ticketDrillDownWhere !== null,
    reports: {
      timeSla: true,
      quality: true,
      automatedResolution: true,
      ticketPerTransaction: scope.type === "GLOBAL",
      recurringProblems: true,
    },
  };
}
