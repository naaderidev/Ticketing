import {
  OrganizationAccessRequestType,
  OrganizationMembershipRole,
  Prisma,
} from "@prisma/client";
import { runSerializableTransaction } from "@/lib/database-transaction";
import {
  conflictError,
  notFoundError,
  rethrowPersistenceError,
  validationError,
} from "@/lib/domain-error";
import { prisma } from "@/lib/prisma";
import type {
  CreateOrganizationInput,
  OrganizationAccessRequestInput,
  OrganizationScopeInput,
} from "@/modules/organizations/contracts/organization-schemas";
import {
  canApproveAccessRequest,
  canManageOrganizationMemberships,
} from "@/modules/organizations/domain/organization-access-policy";
import {
  hasGlobalPermission,
  ORGANIZATION_PERMISSIONS,
} from "@/modules/organizations/application/organization-authorization";

type Transaction = Prisma.TransactionClient;

async function hasGlobalPermissionInTransaction(
  transaction: Transaction,
  userId: number,
  permissionKey: string,
  now: Date
): Promise<boolean> {
  const assignment = await transaction.userRoleAssignment.findFirst({
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

async function getManagerMembershipInTransaction(
  transaction: Transaction,
  userId: number,
  organizationId: number,
  now: Date
) {
  const membership = await transaction.organizationMembership.findUnique({
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

async function canManageAccessInTransaction(
  transaction: Transaction,
  userId: number,
  organizationId: number,
  permissionKey: string,
  now: Date
): Promise<boolean> {
  const [hasGlobalPermission, membership] = await Promise.all([
    hasGlobalPermissionInTransaction(
      transaction,
      userId,
      permissionKey,
      now
    ),
    getManagerMembershipInTransaction(
      transaction,
      userId,
      organizationId,
      now
    ),
  ]);
  return hasGlobalPermission || membership !== null;
}

function includesOrganizationWideScope(
  scopes: OrganizationScopeInput[]
): boolean {
  return scopes.some(
    (scope) => scope.type === "ORGANIZATION" && scope.scopeKey === "*"
  );
}

function assertRoleScopeCompatibility(
  role: OrganizationMembershipRole,
  scopes: OrganizationScopeInput[]
): void {
  if (role === "MANAGER" && !includesOrganizationWideScope(scopes)) {
    throw validationError(
      "نقش مدیر شرکت باید محدوده کامل سازمان را داشته باشد"
    );
  }
}

function pendingAccessRequestKey(
  organizationId: number,
  targetUserId: number,
  requestType: OrganizationAccessRequestType
): string {
  return `${organizationId}:${targetUserId}:${requestType}`;
}

async function assertTargetMembershipState(
  transaction: Transaction,
  input: {
    organizationId: number;
    targetUserId: number;
    requestType: OrganizationAccessRequestType;
  }
): Promise<void> {
  const membership = await transaction.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.targetUserId,
      },
    },
    select: { status: true },
  });

  if (
    input.requestType === "ADD_MEMBERSHIP" &&
    membership?.status === "ACTIVE"
  ) {
    throw conflictError("کاربر در حال حاضر عضو فعال این سازمان است");
  }

  if (input.requestType !== "ADD_MEMBERSHIP" && !membership) {
    throw notFoundError("عضویت سازمانی کاربر یافت نشد");
  }

  if (
    input.requestType !== "ADD_MEMBERSHIP" &&
    membership?.status !== "ACTIVE"
  ) {
    throw conflictError("عضویت سازمانی کاربر فعال نیست");
  }
}

export async function createOrganization(
  actorUserId: number,
  input: CreateOrganizationInput
) {
  try {
    return await runSerializableTransaction(async (transaction) => {
      const now = new Date();
      const canCreate = await hasGlobalPermissionInTransaction(
        transaction,
        actorUserId,
        ORGANIZATION_PERMISSIONS.CREATE,
        now
      );
      if (!canCreate) throw notFoundError("سازمان یافت نشد");

      const manager = await transaction.user.findUnique({
        where: { id: input.managerUserId },
        select: { id: true },
      });
      if (!manager) throw notFoundError("مدیر اولیه یافت نشد");

      const party = await transaction.party.create({
        data: {
          type: "ORGANIZATION",
          displayName: input.legalName,
          organization: {
            create: {
              legalName: input.legalName,
              nationalId: input.nationalId ?? null,
            },
          },
        },
        include: { organization: true },
      });
      if (!party.organization) {
        throw new Error("Organization nested create returned no organization");
      }

      const membership = await transaction.organizationMembership.create({
        data: {
          organizationId: party.organization.id,
          userId: manager.id,
          role: "MANAGER",
          status: "ACTIVE",
          validFrom: now,
          scopes: {
            create: { type: "ORGANIZATION", scopeKey: "*" },
          },
        },
        include: { scopes: true },
      });

      return {
        id: party.organization.id,
        partyId: party.id,
        legalName: party.organization.legalName,
        nationalId: party.organization.nationalId,
        status: party.organization.status,
        managerMembershipId: membership.id,
      };
    });
  } catch (error) {
    rethrowPersistenceError(error, {
      unique: "سازمانی با این شناسه ملی از قبل وجود دارد",
    });
  }
}

export async function listOrganizations(input: {
  actorUserId: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const hasGlobalRead = await hasGlobalPermission(
    input.actorUserId,
    ORGANIZATION_PERMISSIONS.MEMBERSHIP_READ,
    now
  );

  return prisma.organization.findMany({
    where: {
      status: { not: "CLOSED" },
      ...(hasGlobalRead
        ? {}
        : {
            memberships: {
              some: {
                userId: input.actorUserId,
                role: "MANAGER",
                status: "ACTIVE",
                validFrom: { lte: now },
                OR: [{ validTo: null }, { validTo: { gt: now } }],
              },
            },
          }),
    },
    orderBy: { legalName: "asc" },
    select: {
      id: true,
      partyId: true,
      legalName: true,
      nationalId: true,
      status: true,
      _count: { select: { memberships: true, accessRequests: true } },
    },
  });
}

export async function listOrganizationMemberships(input: {
  actorUserId: number;
  organizationId: number;
}) {
  const canRead = await canManageOrganizationAccess(
    input.actorUserId,
    input.organizationId,
    ORGANIZATION_PERMISSIONS.MEMBERSHIP_READ
  );
  if (!canRead) throw notFoundError("سازمان یافت نشد");

  const organization = await prisma.organization.findFirst({
    where: { id: input.organizationId, status: { not: "CLOSED" } },
    select: {
      id: true,
      partyId: true,
      legalName: true,
      status: true,
      memberships: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          status: true,
          validFrom: true,
          validTo: true,
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
          scopes: {
            orderBy: [{ type: "asc" }, { scopeKey: "asc" }],
            select: { type: true, scopeKey: true },
          },
        },
      },
    },
  });
  if (!organization) throw notFoundError("سازمان یافت نشد");
  return organization;
}

async function canManageOrganizationAccess(
  userId: number,
  organizationId: number,
  permissionKey: string,
  now = new Date()
): Promise<boolean> {
  const [globalAssignment, membership] = await Promise.all([
    prisma.userRoleAssignment.findFirst({
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
    }),
    prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: {
        role: true,
        status: true,
        validFrom: true,
        validTo: true,
      },
    }),
  ]);
  return (
    globalAssignment !== null ||
    (membership !== null &&
      canManageOrganizationMemberships(membership, now))
  );
}

export async function createOrganizationAccessRequest(
  actorUserId: number,
  organizationId: number,
  input: OrganizationAccessRequestInput
) {
  try {
    return await runSerializableTransaction(async (transaction) => {
      const now = new Date();
      const canRequest = await canManageAccessInTransaction(
        transaction,
        actorUserId,
        organizationId,
        ORGANIZATION_PERMISSIONS.MEMBERSHIP_REQUEST,
        now
      );
      if (!canRequest) throw notFoundError("سازمان یافت نشد");

      const [organization, targetUser] = await Promise.all([
        transaction.organization.findFirst({
          where: { id: organizationId, status: { not: "CLOSED" } },
          select: { id: true },
        }),
        transaction.user.findUnique({
          where: { id: input.targetUserId },
          select: { id: true },
        }),
      ]);
      if (!organization) throw notFoundError("سازمان یافت نشد");
      if (!targetUser) throw notFoundError("کاربر هدف یافت نشد");

      await assertTargetMembershipState(transaction, {
        organizationId,
        targetUserId: input.targetUserId,
        requestType: input.requestType,
      });

      if (input.requestType === "ADD_MEMBERSHIP" && input.requestedRole) {
        assertRoleScopeCompatibility(input.requestedRole, input.scopes);
      }

      return transaction.organizationAccessRequest.create({
        data: {
          organizationId,
          requestedById: actorUserId,
          targetUserId: input.targetUserId,
          requestType: input.requestType,
          pendingKey: pendingAccessRequestKey(
            organizationId,
            input.targetUserId,
            input.requestType
          ),
          requestedRole: input.requestedRole ?? null,
          reason: input.reason,
          scopes: { create: input.scopes },
        },
        include: {
          targetUser: { select: { id: true, firstName: true, lastName: true } },
          scopes: { select: { type: true, scopeKey: true } },
        },
      });
    });
  } catch (error) {
    rethrowPersistenceError(error, {
      unique: "درخواست مشابهی در انتظار بررسی است",
      foreignKeyNotFound: "سازمان یا کاربر هدف یافت نشد",
    });
  }
}

export async function listOrganizationAccessRequests(input: {
  actorUserId: number;
  organizationId: number;
}) {
  const canRead = await canManageOrganizationAccess(
    input.actorUserId,
    input.organizationId,
    ORGANIZATION_PERMISSIONS.MEMBERSHIP_READ
  );
  if (!canRead) throw notFoundError("سازمان یافت نشد");

  return prisma.organizationAccessRequest.findMany({
    where: { organizationId: input.organizationId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      requestType: true,
      requestedRole: true,
      status: true,
      reason: true,
      decisionReason: true,
      decidedAt: true,
      createdAt: true,
      requestedBy: { select: { id: true, firstName: true, lastName: true } },
      targetUser: { select: { id: true, firstName: true, lastName: true } },
      decidedBy: { select: { id: true, firstName: true, lastName: true } },
      scopes: { select: { type: true, scopeKey: true } },
    },
  });
}

async function assertNotRemovingLastManager(
  transaction: Transaction,
  organizationId: number,
  targetUserId: number,
  now: Date
): Promise<void> {
  const target = await transaction.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId: targetUserId } },
    select: {
      role: true,
      status: true,
      validFrom: true,
      validTo: true,
    },
  });
  if (
    !target ||
    target.role !== "MANAGER" ||
    !canManageOrganizationMemberships(target, now)
  ) {
    return;
  }

  const managerCount = await transaction.organizationMembership.count({
    where: {
      organizationId,
      role: "MANAGER",
      status: "ACTIVE",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
    },
  });
  if (managerCount <= 1) {
    throw conflictError("آخرین مدیر فعال سازمان قابل حذف یا تنزل نقش نیست");
  }
}

async function applyApprovedAccessRequest(
  transaction: Transaction,
  request: {
    organizationId: number;
    targetUserId: number;
    requestType: OrganizationAccessRequestType;
    requestedRole: OrganizationMembershipRole | null;
    scopes: OrganizationScopeInput[];
  },
  now: Date
): Promise<void> {
  if (request.requestType === "ADD_MEMBERSHIP") {
    if (!request.requestedRole) {
      throw validationError("نقش درخواستی برای عضویت مشخص نشده است");
    }
    assertRoleScopeCompatibility(request.requestedRole, request.scopes);

    const membership = await transaction.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: request.organizationId,
          userId: request.targetUserId,
        },
      },
      create: {
        organizationId: request.organizationId,
        userId: request.targetUserId,
        role: request.requestedRole,
        status: "ACTIVE",
        validFrom: now,
      },
      update: {
        role: request.requestedRole,
        status: "ACTIVE",
        validFrom: now,
        validTo: null,
      },
      select: { id: true },
    });
    await transaction.organizationMembershipScope.deleteMany({
      where: { membershipId: membership.id },
    });
    await transaction.organizationMembershipScope.createMany({
      data: request.scopes.map((scope) => ({
        membershipId: membership.id,
        type: scope.type,
        scopeKey: scope.scopeKey,
      })),
    });
    return;
  }

  const membership = await transaction.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: request.organizationId,
        userId: request.targetUserId,
      },
    },
    include: { scopes: { select: { type: true, scopeKey: true } } },
  });
  if (!membership) throw notFoundError("عضویت سازمانی کاربر یافت نشد");

  if (request.requestType === "CHANGE_ROLE") {
    if (!request.requestedRole) {
      throw validationError("نقش درخواستی مشخص نشده است");
    }
    if (membership.role === "MANAGER" && request.requestedRole !== "MANAGER") {
      await assertNotRemovingLastManager(
        transaction,
        request.organizationId,
        request.targetUserId,
        now
      );
    }
    await transaction.organizationMembership.update({
      where: { id: membership.id },
      data: { role: request.requestedRole },
    });
    if (
      request.requestedRole === "MANAGER" &&
      !includesOrganizationWideScope(membership.scopes)
    ) {
      await transaction.organizationMembershipScope.create({
        data: {
          membershipId: membership.id,
          type: "ORGANIZATION",
          scopeKey: "*",
        },
      });
    }
    return;
  }

  if (request.requestType === "CHANGE_SCOPE") {
    assertRoleScopeCompatibility(membership.role, request.scopes);
    await transaction.organizationMembershipScope.deleteMany({
      where: { membershipId: membership.id },
    });
    await transaction.organizationMembershipScope.createMany({
      data: request.scopes.map((scope) => ({
        membershipId: membership.id,
        type: scope.type,
        scopeKey: scope.scopeKey,
      })),
    });
    return;
  }

  await assertNotRemovingLastManager(
    transaction,
    request.organizationId,
    request.targetUserId,
    now
  );
  await transaction.organizationMembership.update({
    where: { id: membership.id },
    data: { status: "REVOKED", validTo: now },
  });
}

export async function approveOrganizationAccessRequest(input: {
  actorUserId: number;
  requestId: number;
  decisionReason: string;
}) {
  return runSerializableTransaction(async (transaction) => {
    const now = new Date();
    const request = await transaction.organizationAccessRequest.findUnique({
      where: { id: input.requestId },
      include: { scopes: { select: { type: true, scopeKey: true } } },
    });
    if (!request) throw notFoundError("درخواست دسترسی یافت نشد");
    if (request.status !== "PENDING") {
      throw conflictError("این درخواست قبلاً تعیین تکلیف شده است");
    }

    const [hasGlobalPermission, membership] = await Promise.all([
      hasGlobalPermissionInTransaction(
        transaction,
        input.actorUserId,
        ORGANIZATION_PERMISSIONS.MEMBERSHIP_APPROVE,
        now
      ),
      getManagerMembershipInTransaction(
        transaction,
        input.actorUserId,
        request.organizationId,
        now
      ),
    ]);
    if (
      !canApproveAccessRequest({
        actorUserId: input.actorUserId,
        requesterUserId: request.requestedById,
        hasGlobalPermission,
        membership,
        now,
      })
    ) {
      throw notFoundError("درخواست دسترسی یافت نشد");
    }

    await applyApprovedAccessRequest(transaction, request, now);
    return transaction.organizationAccessRequest.update({
      where: { id: request.id },
      data: {
        status: "EXECUTED",
        pendingKey: null,
        decidedById: input.actorUserId,
        decisionReason: input.decisionReason,
        decidedAt: now,
      },
      select: { id: true, organizationId: true, status: true, decidedAt: true },
    });
  });
}

export async function rejectOrganizationAccessRequest(input: {
  actorUserId: number;
  requestId: number;
  decisionReason: string;
}) {
  return runSerializableTransaction(async (transaction) => {
    const now = new Date();
    const request = await transaction.organizationAccessRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        organizationId: true,
        requestedById: true,
        status: true,
      },
    });
    if (!request) throw notFoundError("درخواست دسترسی یافت نشد");
    if (request.status !== "PENDING") {
      throw conflictError("این درخواست قبلاً تعیین تکلیف شده است");
    }

    const [hasGlobalPermission, membership] = await Promise.all([
      hasGlobalPermissionInTransaction(
        transaction,
        input.actorUserId,
        ORGANIZATION_PERMISSIONS.MEMBERSHIP_APPROVE,
        now
      ),
      getManagerMembershipInTransaction(
        transaction,
        input.actorUserId,
        request.organizationId,
        now
      ),
    ]);
    if (
      !canApproveAccessRequest({
        actorUserId: input.actorUserId,
        requesterUserId: request.requestedById,
        hasGlobalPermission,
        membership,
        now,
      })
    ) {
      throw notFoundError("درخواست دسترسی یافت نشد");
    }

    return transaction.organizationAccessRequest.update({
      where: { id: request.id },
      data: {
        status: "REJECTED",
        pendingKey: null,
        decidedById: input.actorUserId,
        decisionReason: input.decisionReason,
        decidedAt: now,
      },
      select: { id: true, organizationId: true, status: true, decidedAt: true },
    });
  });
}
