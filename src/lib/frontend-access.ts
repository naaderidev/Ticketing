import "server-only";

import { prisma } from "@/lib/prisma";

const PERMISSIONS = {
  workspace: "support.workspace.access",
  ticketRead: "ticket.workspace.read",
  supportCatalogManage: "support.catalog.manage",
  supportTeamManage: "support.team.manage",
  supportRoutingManage: "support.routing.manage",
  organizationCreate: "organization.create",
  organizationApprove: "organization.membership.approve",
  knowledgeManage: "knowledge.article.manage",
  knowledgePublish: "knowledge.article.publish",
  reportingTeam: "reporting.kpi.read.team",
  reportingGlobal: "reporting.kpi.read.global",
  reportingAudit: "reporting.kpi.audit.read",
} as const;

export type AdminCapability =
  | "workspace"
  | "reporting"
  | "supportCatalog"
  | "organizations"
  | "knowledge"
  | "users";

export type FrontendAccessProfile = {
  isStaff: boolean;
  staffRoleKeys: string[];
  organizationRoleKeys: Array<"MANAGER" | "REPRESENTATIVE">;
  roleLabels: string[];
  capabilities: Record<AdminCapability, boolean>;
  defaultHref: "/admin/workspace" | "/admin/reporting" | "/admin/organizations" | "/admin/notifications" | "/user";
};

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export async function getFrontendAccessProfile(
  userId: number,
  now = new Date(),
): Promise<FrontendAccessProfile> {
  const [assignments, memberships] = await Promise.all([
    prisma.userRoleAssignment.findMany({
      where: {
        userId,
        status: "ACTIVE",
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gt: now } }],
      },
      select: {
        role: {
          select: {
            key: true,
            name: true,
            permissions: {
              select: { permission: { select: { key: true } } },
            },
          },
        },
      },
    }),
    prisma.organizationMembership.findMany({
      where: { userId, status: "ACTIVE" },
      select: { role: true },
    }),
  ]);

  const staffRoleKeys = unique(assignments.map(({ role }) => role.key));
  const staffRoleLabels = unique(assignments.map(({ role }) => role.name));
  const organizationRoleKeys = unique(memberships.map(({ role }) => role));
  const organizationRoleLabels = organizationRoleKeys.map((role) =>
    role === "MANAGER" ? "مدیر شرکت" : "نماینده شرکت",
  );
  const permissionKeys = new Set(
    assignments.flatMap(({ role }) =>
      role.permissions.map(({ permission }) => permission.key),
    ),
  );
  const hasAnyPermission = (...keys: string[]) =>
    keys.some((key) => permissionKeys.has(key));

  const capabilities = {
    workspace:
      permissionKeys.has(PERMISSIONS.workspace) &&
      permissionKeys.has(PERMISSIONS.ticketRead),
    reporting: hasAnyPermission(
      PERMISSIONS.reportingTeam,
      PERMISSIONS.reportingGlobal,
      PERMISSIONS.reportingAudit,
    ),
    supportCatalog: hasAnyPermission(
      PERMISSIONS.supportCatalogManage,
      PERMISSIONS.supportTeamManage,
      PERMISSIONS.supportRoutingManage,
    ),
    organizations: hasAnyPermission(
      PERMISSIONS.organizationCreate,
      PERMISSIONS.organizationApprove,
    ),
    knowledge: hasAnyPermission(
      PERMISSIONS.knowledgeManage,
      PERMISSIONS.knowledgePublish,
    ),
    users: staffRoleKeys.includes("SYSTEM_ADMINISTRATOR"),
  } satisfies Record<AdminCapability, boolean>;

  const defaultHref = capabilities.workspace
    ? "/admin/workspace"
    : capabilities.reporting
      ? "/admin/reporting"
      : capabilities.organizations
        ? "/admin/organizations"
        : assignments.length > 0
          ? "/admin/notifications"
          : "/user";

  return {
    isStaff: assignments.length > 0,
    staffRoleKeys,
    organizationRoleKeys,
    roleLabels: unique([...staffRoleLabels, ...organizationRoleLabels]),
    capabilities,
    defaultHref,
  };
}

export async function hasAdminCapability(
  userId: number,
  capability: AdminCapability,
): Promise<boolean> {
  const profile = await getFrontendAccessProfile(userId);
  return profile.capabilities[capability];
}
