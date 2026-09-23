import { prisma } from "@/lib/prisma";
import {
  canManageOrganizationMemberships,
  type MembershipState,
} from "@/modules/organizations/domain/organization-access-policy";

export const ORGANIZATION_PERMISSIONS = {
  CREATE: "organization.create",
  MEMBERSHIP_READ: "organization.membership.read",
  MEMBERSHIP_REQUEST: "organization.membership.request",
  MEMBERSHIP_APPROVE: "organization.membership.approve",
  AUDIT_READ: "organization.audit.read",
} as const;

export async function hasGlobalPermission(
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
        permissions: {
          some: { permission: { key: permissionKey } },
        },
      },
    },
    select: { id: true },
  });
  return assignment !== null;
}

export async function getActiveOrganizationManagerMembership(
  userId: number,
  organizationId: number,
  now = new Date()
): Promise<(MembershipState & { id: number }) | null> {
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: {
      id: true,
      role: true,
      status: true,
      validFrom: true,
      validTo: true,
    },
  });

  return membership && canManageOrganizationMemberships(membership, now)
    ? membership
    : null;
}

export async function canReadOrganizationMemberships(
  userId: number,
  organizationId: number,
  now = new Date()
): Promise<boolean> {
  const [hasPermission, managerMembership] = await Promise.all([
    hasGlobalPermission(userId, ORGANIZATION_PERMISSIONS.MEMBERSHIP_READ, now),
    getActiveOrganizationManagerMembership(userId, organizationId, now),
  ]);
  return hasPermission || managerMembership !== null;
}

export async function canRequestOrganizationAccessChange(
  userId: number,
  organizationId: number,
  now = new Date()
): Promise<boolean> {
  const [hasPermission, managerMembership] = await Promise.all([
    hasGlobalPermission(
      userId,
      ORGANIZATION_PERMISSIONS.MEMBERSHIP_REQUEST,
      now
    ),
    getActiveOrganizationManagerMembership(userId, organizationId, now),
  ]);
  return hasPermission || managerMembership !== null;
}
