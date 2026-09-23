import { Prisma, type SupportPriority } from "@prisma/client";
import { runSerializableTransaction } from "@/lib/database-transaction";
import {
  conflictError,
  notFoundError,
  rethrowPersistenceError,
  validationError,
} from "@/lib/domain-error";
import { prisma } from "@/lib/prisma";
import {
  hasAnySupportPermission,
  hasGlobalSupportPermission,
  SUPPORT_PERMISSIONS,
} from "@/modules/support-catalog/application/support-authorization";
import type {
  AssignSupportTeamMemberInput,
  CreateSupportRequestTypeInput,
  CreateSupportServiceInput,
  CreateSupportTeamInput,
  PublishSupportRouteInput,
  ReconcileLegacyCatalogMappingInput,
} from "@/modules/support-catalog/contracts/support-catalog-schemas";

type Transaction = Prisma.TransactionClient;

async function requireGlobalPermission(
  actorUserId: number,
  permissionKey: string
): Promise<void> {
  if (!(await hasGlobalSupportPermission(actorUserId, permissionKey))) {
    throw notFoundError("منبع پشتیبانی یافت نشد");
  }
}

function optionalText(value: string | undefined): string | null {
  return value?.trim() || null;
}

export async function getCustomerSupportCatalog(now = new Date()) {
  const routeWindow = {
    status: "ACTIVE" as const,
    effectiveFrom: { lte: now },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    slaPolicy: {
      is: {
        status: "ACTIVE" as const,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
    },
  };

  const services = await prisma.supportService.findMany({
    where: {
      status: "ACTIVE",
      requestTypes: {
        some: { status: "ACTIVE", routes: { some: routeWindow } },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      requestTypes: {
        where: { status: "ACTIVE", routes: { some: routeWindow } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          businessSubjectType: true,
          requiresBusinessSubject: true,
          requiresRootCause: true,
          routes: {
            where: routeWindow,
            orderBy: { version: "desc" },
            take: 1,
            select: {
              version: true,
              defaultPriority: true,
              slaPolicy: {
                select: {
                  code: true,
                  version: true,
                  clockType: true,
                  firstResponseMinutes: true,
                  resolutionMinutes: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return services.map((service) => ({
    id: service.id,
    code: service.code,
    name: service.name,
    description: service.description,
    requestTypes: service.requestTypes.map((requestType) => ({
      id: requestType.id,
      code: requestType.code,
      name: requestType.name,
      description: requestType.description,
      businessSubjectType: requestType.businessSubjectType,
      requiresBusinessSubject: requestType.requiresBusinessSubject,
      requiresRootCause: requestType.requiresRootCause,
      routeVersion: requestType.routes[0].version,
      defaultPriority: requestType.routes[0].defaultPriority,
      slaPolicy: requestType.routes[0].slaPolicy,
    })),
  }));
}

export async function getWorkspaceQueues(input: {
  actorUserId: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [hasWorkspaceAccess, hasGlobalQueueAccess] = await Promise.all([
    hasAnySupportPermission(
      input.actorUserId,
      SUPPORT_PERMISSIONS.WORKSPACE_ACCESS,
      now
    ),
    hasGlobalSupportPermission(
      input.actorUserId,
      SUPPORT_PERMISSIONS.QUEUE_READ,
      now
    ),
  ]);
  if (!hasWorkspaceAccess) throw notFoundError("فضای کاری یافت نشد");

  const queues = await prisma.supportQueue.findMany({
    where: {
      status: "ACTIVE",
      team: {
        status: "ACTIVE",
        ...(hasGlobalQueueAccess
          ? {}
          : {
              roleAssignments: {
                some: {
                  userId: input.actorUserId,
                  scopeType: "SUPPORT_TEAM",
                  status: "ACTIVE",
                  validFrom: { lte: now },
                  OR: [{ validTo: null }, { validTo: { gt: now } }],
                  role: {
                    permissions: {
                      some: {
                        permission: { key: SUPPORT_PERMISSIONS.QUEUE_READ },
                      },
                    },
                  },
                },
              },
            }),
      },
    },
    orderBy: [{ team: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      isDefault: true,
      team: { select: { id: true, code: true, name: true } },
      _count: {
        select: {
          tickets: {
            where: {
              lifecycleStatus: {
                notIn: ["CLOSED", "CLOSED_LEGACY"],
              },
            },
          },
        },
      },
    },
  });

  return queues.map((queue) => ({
    ...queue,
    ticketCount: queue._count.tickets,
  }));
}

export async function getSupportTeamMemberCandidates(actorUserId: number) {
  await requireGlobalPermission(actorUserId, SUPPORT_PERMISSIONS.TEAM_MANAGE);

  return prisma.user.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  });
}

export async function getSupportManagementSnapshot(actorUserId: number) {
  await requireGlobalPermission(
    actorUserId,
    SUPPORT_PERMISSIONS.CATALOG_MANAGE
  );

  const [services, teams, legacyMappings] = await Promise.all([
    prisma.supportService.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        requestTypes: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: {
            routes: {
              orderBy: { version: "desc" },
              include: {
                queue: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    team: { select: { id: true, code: true, name: true } },
                  },
                },
                slaPolicy: {
                  select: {
                    id: true,
                    code: true,
                    version: true,
                    clockType: true,
                    firstResponseMinutes: true,
                    resolutionMinutes: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.supportTeam.findMany({
      orderBy: { name: "asc" },
      include: {
        queues: { orderBy: [{ isDefault: "desc" }, { name: "asc" }] },
        roleAssignments: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            status: true,
            validFrom: true,
            validTo: true,
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
            role: { select: { key: true, name: true } },
          },
        },
      },
    }),
    prisma.legacySupportCatalogMapping.findMany({
      orderBy: [{ status: "asc" }, { sourceType: "asc" }, { legacyId: "asc" }],
      select: {
        id: true,
        sourceType: true,
        legacyId: true,
        status: true,
        reviewedAt: true,
        department: { select: { id: true, name: true } },
        subDepartment: {
          select: {
            id: true,
            name: true,
            department: { select: { id: true, name: true } },
          },
        },
        supportService: { select: { id: true, code: true, name: true } },
        supportRequestType: {
          select: { id: true, code: true, name: true },
        },
      },
    }),
  ]);

  return { services, teams, legacyMappings };
}

export async function createSupportService(
  actorUserId: number,
  input: CreateSupportServiceInput
) {
  await requireGlobalPermission(
    actorUserId,
    SUPPORT_PERMISSIONS.CATALOG_MANAGE
  );
  try {
    return await prisma.supportService.create({
      data: {
        code: input.code,
        name: input.name,
        description: optionalText(input.description),
        sortOrder: input.sortOrder,
      },
      select: { id: true, code: true, name: true, status: true },
    });
  } catch (error) {
    rethrowPersistenceError(error, {
      unique: "خدمتی با این کد از قبل وجود دارد",
    });
  }
}

export async function createSupportTeam(
  actorUserId: number,
  input: CreateSupportTeamInput
) {
  await requireGlobalPermission(actorUserId, SUPPORT_PERMISSIONS.TEAM_MANAGE);
  try {
    return await runSerializableTransaction(async (transaction) => {
      return transaction.supportTeam.create({
        data: {
          code: input.code,
          name: input.name,
          description: optionalText(input.description),
          queues: {
            create: {
              code: input.defaultQueue.code,
              name: input.defaultQueue.name,
              description: optionalText(input.defaultQueue.description),
              isDefault: true,
            },
          },
        },
        include: { queues: true },
      });
    });
  } catch (error) {
    rethrowPersistenceError(error, {
      unique: "کد تیم یا صف از قبل استفاده شده است",
    });
  }
}

async function assertActiveServiceAndQueue(
  transaction: Transaction,
  serviceId: number,
  queueId: number
): Promise<void> {
  const [service, queue] = await Promise.all([
    transaction.supportService.findFirst({
      where: { id: serviceId, status: "ACTIVE" },
      select: { id: true },
    }),
    transaction.supportQueue.findFirst({
      where: { id: queueId, status: "ACTIVE", team: { status: "ACTIVE" } },
      select: { id: true },
    }),
  ]);
  if (!service) throw notFoundError("خدمت فعال یافت نشد");
  if (!queue) throw notFoundError("صف فعال یافت نشد");
}

async function findActiveSlaPolicy(
  transaction: Transaction,
  priority: SupportPriority,
  now = new Date()
) {
  const policy = await transaction.slaPolicy.findFirst({
    where: {
      priority,
      status: "ACTIVE",
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      AND: [
        {
          OR: [
            { clockType: "CALENDAR" },
            {
              clockType: "BUSINESS",
              calendar: { is: { status: "ACTIVE" } },
            },
          ],
        },
      ],
    },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (!policy) throw new Error(`Active SLA policy is missing for ${priority}`);
  return policy;
}

export async function createSupportRequestType(
  actorUserId: number,
  input: CreateSupportRequestTypeInput
) {
  await requireGlobalPermission(
    actorUserId,
    SUPPORT_PERMISSIONS.CATALOG_MANAGE
  );
  try {
    return await runSerializableTransaction(async (transaction) => {
      await assertActiveServiceAndQueue(
        transaction,
        input.serviceId,
        input.queueId
      );
      const slaPolicy = await findActiveSlaPolicy(
        transaction,
        input.defaultPriority
      );
      const requestType = await transaction.supportRequestType.create({
        data: {
          serviceId: input.serviceId,
          code: input.code,
          name: input.name,
          description: optionalText(input.description),
          businessSubjectType: optionalText(input.businessSubjectType),
          requiresBusinessSubject: input.requiresBusinessSubject,
          requiresRootCause: input.requiresRootCause,
          sortOrder: input.sortOrder,
        },
      });
      const route = await transaction.supportCatalogRoute.create({
        data: {
          requestTypeId: requestType.id,
          queueId: input.queueId,
          version: 1,
          defaultPriority: input.defaultPriority,
          slaPolicyId: slaPolicy.id,
          activeKey: String(requestType.id),
        },
        include: {
          queue: { include: { team: { select: { id: true, name: true } } } },
        },
      });
      return { ...requestType, activeRoute: route };
    });
  } catch (error) {
    rethrowPersistenceError(error, {
      unique: "نوع درخواست یا مسیر فعال تکراری است",
      foreignKeyNotFound: "خدمت یا صف یافت نشد",
    });
  }
}

export async function assignSupportTeamMember(
  actorUserId: number,
  supportTeamId: number,
  input: AssignSupportTeamMemberInput
) {
  await requireGlobalPermission(actorUserId, SUPPORT_PERMISSIONS.TEAM_MANAGE);
  const now = new Date();
  const validTo = input.validTo ? new Date(input.validTo) : null;
  if (validTo && validTo <= now) {
    throw validationError("پایان اعتبار باید در آینده باشد");
  }

  return runSerializableTransaction(async (transaction) => {
    const [team, user, role] = await Promise.all([
      transaction.supportTeam.findFirst({
        where: { id: supportTeamId, status: "ACTIVE" },
        select: { id: true },
      }),
      transaction.user.findUnique({
        where: { id: input.userId },
        select: { id: true },
      }),
      transaction.role.findUnique({
        where: { key: input.roleKey },
        select: { id: true },
      }),
    ]);
    if (!team) throw notFoundError("تیم پشتیبانی یافت نشد");
    if (!user) throw notFoundError("کاربر یافت نشد");
    if (!role) throw new Error(`${input.roleKey} role is not configured`);

    await transaction.userRoleAssignment.updateMany({
      where: {
        userId: input.userId,
        supportTeamId,
        role: { key: { in: ["SUPPORT_AGENT", "SUPERVISOR"] } },
        status: "ACTIVE",
      },
      data: { status: "REVOKED", validTo: now },
    });

    return transaction.userRoleAssignment.upsert({
      where: {
        userId_roleId_scopeType_scopeKey: {
          userId: input.userId,
          roleId: role.id,
          scopeType: "SUPPORT_TEAM",
          scopeKey: String(supportTeamId),
        },
      },
      update: {
        supportTeamId,
        status: "ACTIVE",
        validFrom: now,
        validTo,
      },
      create: {
        userId: input.userId,
        roleId: role.id,
        supportTeamId,
        scopeType: "SUPPORT_TEAM",
        scopeKey: String(supportTeamId),
        status: "ACTIVE",
        validFrom: now,
        validTo,
      },
      select: {
        id: true,
        status: true,
        validFrom: true,
        validTo: true,
        role: { select: { key: true, name: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
        supportTeam: { select: { id: true, code: true, name: true } },
      },
    });
  });
}

export async function publishSupportCatalogRoute(
  actorUserId: number,
  requestTypeId: number,
  input: PublishSupportRouteInput
) {
  await requireGlobalPermission(
    actorUserId,
    SUPPORT_PERMISSIONS.ROUTING_MANAGE
  );
  return runSerializableTransaction(async (transaction) => {
    const [requestType, queue, latestRoute, slaPolicy] = await Promise.all([
      transaction.supportRequestType.findFirst({
        where: { id: requestTypeId, status: "ACTIVE" },
        select: { id: true },
      }),
      transaction.supportQueue.findFirst({
        where: {
          id: input.queueId,
          status: "ACTIVE",
          team: { status: "ACTIVE" },
        },
        select: { id: true },
      }),
      transaction.supportCatalogRoute.findFirst({
        where: { requestTypeId },
        orderBy: { version: "desc" },
        select: { version: true },
      }),
      findActiveSlaPolicy(transaction, input.defaultPriority),
    ]);
    if (!requestType) throw notFoundError("نوع درخواست فعال یافت نشد");
    if (!queue) throw notFoundError("صف فعال یافت نشد");

    const now = new Date();
    const retired = await transaction.supportCatalogRoute.updateMany({
      where: { requestTypeId, status: "ACTIVE" },
      data: { status: "RETIRED", activeKey: null, effectiveTo: now },
    });
    if (retired.count !== 1) {
      throw conflictError("نوع درخواست باید دقیقاً یک مسیر فعال داشته باشد");
    }

    return transaction.supportCatalogRoute.create({
      data: {
        requestTypeId,
        queueId: input.queueId,
        version: (latestRoute?.version ?? 0) + 1,
        defaultPriority: input.defaultPriority,
        slaPolicyId: slaPolicy.id,
        activeKey: String(requestTypeId),
        effectiveFrom: now,
      },
      include: {
        queue: { include: { team: { select: { id: true, name: true } } } },
        slaPolicy: {
          select: {
            id: true,
            code: true,
            version: true,
            clockType: true,
            firstResponseMinutes: true,
            resolutionMinutes: true,
          },
        },
      },
    });
  });
}

export async function reconcileLegacyCatalogMapping(
  actorUserId: number,
  mappingId: number,
  input: ReconcileLegacyCatalogMappingInput
) {
  await requireGlobalPermission(
    actorUserId,
    SUPPORT_PERMISSIONS.CATALOG_MANAGE
  );
  return runSerializableTransaction(async (transaction) => {
    const mapping = await transaction.legacySupportCatalogMapping.findUnique({
      where: { id: mappingId },
      select: { id: true, sourceType: true },
    });
    if (!mapping) throw notFoundError("رکورد تطبیق یافت نشد");

    let supportServiceId: number | null = null;
    let supportRequestTypeId: number | null = null;
    if (input.status === "MAPPED" && mapping.sourceType === "DEPARTMENT") {
      if (!input.supportServiceId) {
        throw validationError("برای دپارتمان legacy انتخاب خدمت الزامی است");
      }
      const service = await transaction.supportService.findUnique({
        where: { id: input.supportServiceId },
        select: { id: true },
      });
      if (!service) throw notFoundError("خدمت یافت نشد");
      supportServiceId = service.id;
    }

    if (input.status === "MAPPED" && mapping.sourceType === "SUB_DEPARTMENT") {
      if (!input.supportRequestTypeId) {
        throw validationError("برای زیردپارتمان legacy نوع درخواست الزامی است");
      }
      const requestType = await transaction.supportRequestType.findUnique({
        where: { id: input.supportRequestTypeId },
        select: { id: true, serviceId: true },
      });
      if (!requestType) throw notFoundError("نوع درخواست یافت نشد");
      supportServiceId = requestType.serviceId;
      supportRequestTypeId = requestType.id;
    }

    return transaction.legacySupportCatalogMapping.update({
      where: { id: mapping.id },
      data: {
        status: input.status,
        supportServiceId,
        supportRequestTypeId,
        reviewedAt: new Date(),
      },
      select: {
        id: true,
        sourceType: true,
        legacyId: true,
        status: true,
        supportServiceId: true,
        supportRequestTypeId: true,
        reviewedAt: true,
      },
    });
  });
}
