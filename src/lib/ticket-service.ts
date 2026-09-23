import {
  Prisma,
  TicketStatus,
  type TicketLifecycleStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jalaliToGregorian } from "@/lib/date-utils";
import { parseJalaliDateEnd } from "@/lib/jalali-date";
import { errors } from "@/lib/strings";
import { runSerializableTransaction } from "@/lib/database-transaction";
import {
  AttachmentReference,
  claimPendingUploads,
  processAttachmentDeletionJobs,
  queueAttachmentDeletionJobs,
} from "@/lib/attachment-service";
import {
  publicAttachmentSelect,
  toAttachmentDto,
} from "@/lib/attachment-dto";
import { logOperationalWarning } from "@/lib/operational-logger";
import {
  conflictError,
  notFoundError,
  rethrowPersistenceError,
  validationError,
} from "@/lib/domain-error";
import { appendTicketEvent } from "@/modules/tickets/application/ticket-event-outbox";
import type { TicketEventActorType } from "@/modules/tickets/contracts/ticket-domain-events";
import {
  appendTicketSlaStartedEvent,
  createTicketSlaSnapshot,
  excludeTicketSlaAfterLegacyClosure,
  markTicketFirstResponse,
  recordRoutingDecision,
  resumeTicketResolutionSla,
  slaPolicyInclude,
} from "@/modules/sla-routing/application/sla-service";

function generateTicketId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `TK-${timestamp}-${random}`;
}

interface TicketFilters {
  search?: string;
  status?: string;
  departmentId?: string;
  subDepartmentId?: string;
  userName?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export async function getTickets(filters: TicketFilters) {
  const {
    search,
    status,
    departmentId,
    subDepartmentId,
    userName,
    userId,
    dateFrom,
    dateTo,
    page = 1,
    limit = 10,
  } = filters;

  const where: Prisma.TicketWhereInput = {};
  if (search) {
    where.OR = [
      { ticketId: { contains: search } },
      { subject: { contains: search } },
      { message: { contains: search } },
    ];
  }
  if (status && status !== "all") where.status = status as TicketStatus;
  if (departmentId) where.departmentId = Number(departmentId);
  if (subDepartmentId) where.subDepartmentId = Number(subDepartmentId);
  if (userName) where.userName = { contains: userName };
  if (userId) where.userId = Number(userId);

  if (dateFrom) {
    const gregorianFrom = jalaliToGregorian(dateFrom);
    if (gregorianFrom) where.createdAt = { gte: gregorianFrom };
  }
  if (dateTo) {
    const gregorianTo = parseJalaliDateEnd(dateTo);
    if (gregorianTo) {
      where.createdAt = {
        ...((where.createdAt as Prisma.DateTimeFilter | undefined) ?? {}),
        lte: gregorianTo,
      };
    }
  }

  const skip = (page - 1) * limit;
  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: {
        department: true,
        subDepartment: true,
        user: true,
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.ticket.count({ where }),
  ]);

  return {
    tickets,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

export async function getTicketByTicketId(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { ticketId },
    include: {
      department: true,
      subDepartment: true,
      replies: {
        orderBy: { createdAt: "asc" },
        include: { attachments: { select: publicAttachmentSelect } },
      },
      attachments: { select: publicAttachmentSelect },
    },
  });
  if (!ticket) return null;
  return {
    ...ticket,
    attachments: ticket.attachments.map(toAttachmentDto),
    replies: ticket.replies.map((reply) => ({
      ...reply,
      attachments: reply.attachments.map(toAttachmentDto),
    })),
  };
}

interface CreateTicketData {
  subject: string;
  message: string;
  userName: string;
  departmentId: string;
  subDepartmentId: string;
  attachments?: AttachmentReference[];
  attachmentUploaderId?: number;
  userId?: number;
  actorUserId?: number;
  actorType?: TicketEventActorType;
}

type Transaction = Prisma.TransactionClient;

async function resolveLegacySupportRoute(
  transaction: Transaction,
  subDepartmentId: number
) {
  const now = new Date();
  const mapping = await transaction.legacySupportCatalogMapping.findFirst({
    where: {
      sourceType: "SUB_DEPARTMENT",
      legacyId: subDepartmentId,
      status: "MAPPED",
      supportRequestTypeId: { not: null },
    },
    select: { supportRequestTypeId: true },
  });

  const requestType = mapping?.supportRequestTypeId
    ? await transaction.supportRequestType.findFirst({
        where: {
          id: mapping.supportRequestTypeId,
          status: "ACTIVE",
          service: { status: "ACTIVE" },
        },
        select: { id: true },
      })
    : null;
  const requestTypeId = requestType?.id;
  const route = requestTypeId
    ? await transaction.supportCatalogRoute.findFirst({
        where: {
          requestTypeId,
          status: "ACTIVE",
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          queue: { status: "ACTIVE", team: { status: "ACTIVE" } },
          slaPolicy: {
            is: {
              status: "ACTIVE",
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            },
          },
        },
        select: {
          id: true,
          version: true,
          defaultPriority: true,
          queue: { select: { id: true, teamId: true } },
          slaPolicy: { include: slaPolicyInclude },
        },
      })
    : null;

  if (requestTypeId && route?.slaPolicy) {
    return {
      requestTypeId,
      routeId: route.id,
      queueId: route.queue.id,
      supportTeamId: route.queue.teamId,
      routeVersion: route.version,
      priority: route.defaultPriority,
      slaPolicy: route.slaPolicy,
      quarantined: false,
    };
  }

  const quarantine = await transaction.supportRequestType.findUnique({
    where: { code: "LEGACY_UNCLASSIFIED" },
    select: {
      id: true,
      routes: {
        where: {
          status: "ACTIVE",
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          queue: { status: "ACTIVE", team: { status: "ACTIVE" } },
          slaPolicy: {
            is: {
              status: "ACTIVE",
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            },
          },
        },
        take: 1,
        select: {
          id: true,
          version: true,
          defaultPriority: true,
          queue: { select: { id: true, teamId: true } },
          slaPolicy: { include: slaPolicyInclude },
        },
      },
    },
  });
  const quarantineRoute = quarantine?.routes[0];
  if (!quarantine || !quarantineRoute?.slaPolicy) {
    throw new Error("R5 legacy quarantine route and SLA policy are not configured");
  }
  return {
    requestTypeId: quarantine.id,
    routeId: quarantineRoute.id,
    queueId: quarantineRoute.queue.id,
    supportTeamId: quarantineRoute.queue.teamId,
    routeVersion: quarantineRoute.version,
    priority: quarantineRoute.defaultPriority,
    slaPolicy: quarantineRoute.slaPolicy,
    quarantined: true,
  };
}

export async function createTicket(data: CreateTicketData) {
  const {
    subject,
    message,
    userName,
    departmentId,
    subDepartmentId,
    attachments,
    attachmentUploaderId,
    userId,
    actorUserId,
  } = data;
  if (!subject || !message || !userName || !departmentId || !subDepartmentId) {
    throw validationError(errors.ALL_FIELDS_REQUIRED);
  }
  if (attachments?.length && !attachmentUploaderId) {
    throw validationError(errors.FILE_REFERENCE_INVALID);
  }

  return runSerializableTransaction(async (transaction) => {
    const departmentIdNumber = Number(departmentId);
    const subDepartmentIdNumber = Number(subDepartmentId);
    const department = await transaction.department.findFirst({
      where: { id: departmentIdNumber, internalOnly: false },
    });
    if (!department) throw notFoundError(errors.DEPARTMENT_NOT_FOUND);

    const subDepartment = await transaction.subDepartment.findFirst({
      where: {
        id: subDepartmentIdNumber,
        internalOnly: false,
        department: { internalOnly: false },
      },
    });
    if (!subDepartment) throw notFoundError(errors.SUB_DEPARTMENT_NOT_FOUND);
    if (subDepartment.departmentId !== department.id) {
      throw validationError(errors.SUB_DEPARTMENT_DEPARTMENT_MISMATCH);
    }

    let ownerPartyId: number | null = null;
    if (userId) {
      const owner = await transaction.user.findUnique({
        where: { id: userId },
        select: { id: true, personProfile: { select: { partyId: true } } },
      });
      if (!owner) throw notFoundError(errors.USER_NOT_FOUND);
      ownerPartyId = owner.personProfile?.partyId ?? null;
    }

    const route = await resolveLegacySupportRoute(
      transaction,
      subDepartment.id
    );

    const ticket = await transaction.ticket.create({
      data: {
        ticketId: generateTicketId(),
        subject,
        message,
        userName,
        departmentId: department.id,
        subDepartmentId: subDepartment.id,
        userId: userId ?? null,
        createdById: actorUserId ?? userId ?? null,
        partyId: ownerPartyId,
        lifecycleStatus: "UNASSIGNED",
        priority: route.priority,
        routeVersion: route.routeVersion,
        requestTypeId: route.requestTypeId,
        supportTeamId: route.supportTeamId,
        queueId: route.queueId,
      },
      include: { department: true, subDepartment: true, user: true },
    });

    await transaction.ticketAssignment.create({
      data: {
        ticketId: ticket.id,
        supportTeamId: route.supportTeamId,
        queueId: route.queueId,
        assignedById: actorUserId ?? null,
        reason: route.quarantined
          ? "نگاشت legacy تأیید نشده؛ انتقال به صف بازبینی"
          : "نگاشت تأییدشده کاتالوگ legacy",
        activeKey: String(ticket.id),
      },
    });
    await recordRoutingDecision(transaction, {
      ticketId: ticket.id,
      routeId: route.routeId,
      requestTypeId: route.requestTypeId,
      supportTeamId: route.supportTeamId,
      queueId: route.queueId,
      slaPolicyId: route.slaPolicy.id,
      actorUserId: actorUserId ?? userId ?? null,
      source: route.quarantined ? "QUARANTINE" : "LEGACY_MAPPING",
      routeVersion: route.routeVersion,
      priority: route.priority,
      reason: route.quarantined
        ? "ثبت در صف بازبینی به‌علت نبود نگاشت تأییدشده"
        : "مسیریابی بر اساس نگاشت تأییدشده legacy",
    });
    const initialMessage = await transaction.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        visibility: "PUBLIC",
        authorType: "CUSTOMER",
        actorUserId: actorUserId ?? userId ?? null,
        authorPartyId: ownerPartyId,
        authorSnapshot: userName,
        body: message,
      },
    });
    const ticketSla = await createTicketSlaSnapshot(transaction, {
      ticketInternalId: ticket.id,
      ticketPublicId: ticket.ticketId,
      startedAt: ticket.createdAt,
      legacyImported: false,
      policy: route.slaPolicy,
      actorUserId: actorUserId ?? userId ?? null,
      actorType: data.actorType ?? "USER",
      sourceType: "HUMAN",
      deferStartedEvent: true,
    });
    await appendTicketEvent(transaction, {
      ticketInternalId: ticket.id,
      ticketPublicId: ticket.ticketId,
      type: "ticket.created.v1",
      actorType: data.actorType ?? "USER",
      sourceType: "HUMAN",
      visibility: "INTERNAL",
      toStatus: "UNASSIGNED",
      actorUserId: actorUserId ?? userId ?? null,
      metadata: {
        adapter: "legacy-v1",
        quarantined: route.quarantined,
        routeVersion: route.routeVersion,
      },
    });
    await appendTicketSlaStartedEvent(transaction, {
      ticketInternalId: ticket.id,
      ticketPublicId: ticket.ticketId,
      startedAt: ticket.createdAt,
      legacyImported: false,
      policy: route.slaPolicy,
      actorUserId: actorUserId ?? userId ?? null,
      actorType: data.actorType ?? "USER",
      sourceType: "HUMAN",
    }, ticketSla.enforcementMode);
    await appendTicketEvent(transaction, {
      ticketInternalId: ticket.id,
      ticketPublicId: ticket.ticketId,
      type: "ticket.routed.v1",
      actorType: data.actorType ?? "USER",
      sourceType: "HUMAN",
      visibility: "INTERNAL",
      fromStatus: "NEW",
      toStatus: "UNASSIGNED",
      actorUserId: actorUserId ?? userId ?? null,
      metadata: {
        adapter: "legacy-v1",
        requestTypeId: route.requestTypeId,
        supportTeamId: route.supportTeamId,
        queueId: route.queueId,
        routeVersion: route.routeVersion,
        priority: route.priority,
        quarantined: route.quarantined,
      },
    });

    if (attachments?.length && attachmentUploaderId) {
      await claimPendingUploads(
        transaction,
        attachments,
        attachmentUploaderId,
        {
          kind: "message",
          ticketId: ticket.id,
          messageId: initialMessage.id,
        }
      );
    }

    await transaction.notification.create({
      data: {
        ticket: { connect: { id: ticket.id } },
        recipientType: "ADMIN",
        message: `تیکت جدید ${ticket.ticketId} توسط ${ticket.userName} برای دپارتمان ${ticket.department.name} ایجاد شد`,
      },
    });

    if (userId) {
      await transaction.notification.create({
        data: {
          ticket: { connect: { id: ticket.id } },
          user: { connect: { id: userId } },
          recipientType: "USER",
          message: `تیکت جدید ${ticket.ticketId} توسط ${ticket.userName} برای دپارتمان ${ticket.department.name} ایجاد شد`,
        },
      });
    }

    return ticket;
  });
}

interface UpdateTicketData {
  status?: TicketStatus;
  departmentId?: number;
  subDepartmentId?: number;
  closedReason?: string;
  closedBy?: "USER" | "ADMIN";
  actorUserId?: number;
}

export async function updateTicket(ticketId: string, data: UpdateTicketData) {
  return runSerializableTransaction(async (transaction) => {
    const ticket = await transaction.ticket.findUnique({ where: { ticketId } });
    if (!ticket) throw notFoundError(errors.TICKET_NOT_FOUND);
    const occurredAt = new Date();

    let destinationDepartmentName: string | null = null;
    let destinationRoute:
      | Awaited<ReturnType<typeof resolveLegacySupportRoute>>
      | null = null;
    if (data.departmentId || data.subDepartmentId) {
      const destinationDepartmentId = data.departmentId ?? ticket.departmentId;
      const destinationSubDepartmentId = data.subDepartmentId ?? ticket.subDepartmentId;
      const destinationDepartment = await transaction.department.findFirst({
        where: { id: destinationDepartmentId, internalOnly: false },
      });
      if (!destinationDepartment) throw notFoundError(errors.DEPARTMENT_NOT_FOUND);

      const destinationSubDepartment = await transaction.subDepartment.findFirst({
        where: {
          id: destinationSubDepartmentId,
          internalOnly: false,
          department: { internalOnly: false },
        },
      });
      if (!destinationSubDepartment) {
        throw notFoundError(errors.SUB_DEPARTMENT_NOT_FOUND);
      }
      if (destinationSubDepartment.departmentId !== destinationDepartment.id) {
        throw validationError(errors.SUB_DEPARTMENT_DEPARTMENT_MISMATCH);
      }
      destinationDepartmentName = destinationDepartment.name;
      destinationRoute = await resolveLegacySupportRoute(
        transaction,
        destinationSubDepartment.id
      );
    }

    const updateData: Prisma.TicketUpdateInput = {
      version: { increment: 1 },
    };
    if (data.status) updateData.status = data.status;
    if (data.departmentId) {
      updateData.department = { connect: { id: data.departmentId } };
    }
    if (data.subDepartmentId) {
      updateData.subDepartment = { connect: { id: data.subDepartmentId } };
    }
    if (destinationRoute) {
      updateData.requestType = {
        connect: { id: destinationRoute.requestTypeId },
      };
      updateData.supportTeam = {
        connect: { id: destinationRoute.supportTeamId },
      };
      updateData.queue = { connect: { id: destinationRoute.queueId } };
      updateData.priority = destinationRoute.priority;
      updateData.routeVersion = destinationRoute.routeVersion;
      updateData.ownerUser = { disconnect: true };
      updateData.lifecycleStatus = "UNASSIGNED";
    }
    if (data.status === "CLOSED") {
      if (!data.closedReason) throw validationError(errors.CLOSE_REASON_REQUIRED);
      updateData.closedAt = occurredAt;
      updateData.closedReason = data.closedReason;
      updateData.closedBy = data.closedBy ?? "ADMIN";
      updateData.resolutionSummary = data.closedReason;
      updateData.lifecycleStatus = "CLOSED_LEGACY";
    } else if (data.status) {
      updateData.closedAt = null;
      updateData.closedReason = null;
      updateData.closedBy = null;
      updateData.resolutionSummary = null;
      updateData.lifecycleStatus = destinationRoute
        ? "UNASSIGNED"
        : ticket.ownerUserId
          ? "IN_PROGRESS"
          : "UNASSIGNED";
    }

    const updated = await transaction.ticket.update({
      where: { ticketId },
      data: updateData,
      include: { department: true, subDepartment: true },
    });

    if (destinationRoute) {
      const changedRoute =
        ticket.supportTeamId !== destinationRoute.supportTeamId ||
        ticket.queueId !== destinationRoute.queueId;
      if (changedRoute) {
        await transaction.ticketAssignment.updateMany({
          where: { ticketId: ticket.id, endedAt: null },
          data: { endedAt: occurredAt, activeKey: null },
        });
        await transaction.ticketAssignment.create({
          data: {
            ticketId: ticket.id,
            supportTeamId: destinationRoute.supportTeamId,
            queueId: destinationRoute.queueId,
            assignedById: data.actorUserId ?? null,
            reason: destinationRoute.quarantined
              ? "انتقال legacy به صف بازبینی"
              : "انتقال بر اساس نگاشت تأییدشده legacy",
            activeKey: String(ticket.id),
          },
        });
        await recordRoutingDecision(transaction, {
          ticketId: ticket.id,
          routeId: destinationRoute.routeId,
          requestTypeId: destinationRoute.requestTypeId,
          supportTeamId: destinationRoute.supportTeamId,
          queueId: destinationRoute.queueId,
          slaPolicyId: destinationRoute.slaPolicy.id,
          actorUserId: data.actorUserId ?? null,
          source: destinationRoute.quarantined
            ? "QUARANTINE"
            : "LEGACY_MAPPING",
          routeVersion: destinationRoute.routeVersion,
          priority: destinationRoute.priority,
          reason: destinationRoute.quarantined
            ? "انتقال legacy به صف بازبینی"
            : "انتقال بر اساس نگاشت تأییدشده legacy",
          quarantined: destinationRoute.quarantined,
        });
        await appendTicketEvent(transaction, {
          ticketInternalId: ticket.id,
          ticketPublicId: ticket.ticketId,
          type: "ticket.transferred.v1",
          actorType: "STAFF",
          sourceType: "HUMAN",
          visibility: "INTERNAL",
          fromStatus: ticket.lifecycleStatus ?? "UNASSIGNED",
          toStatus: "UNASSIGNED",
          actorUserId: data.actorUserId ?? null,
          metadata: {
            adapter: "legacy-v1",
            quarantined: destinationRoute.quarantined,
            fromQueueId: ticket.queueId,
            toQueueId: destinationRoute.queueId,
          },
          occurredAt,
        });
      }
    }

    if (data.status) {
      if (data.status === "CLOSED") {
        await excludeTicketSlaAfterLegacyClosure(
          transaction,
          ticket.id,
          occurredAt
        );
      }
      await appendTicketEvent(transaction, {
        ticketInternalId: ticket.id,
        ticketPublicId: ticket.ticketId,
        type: data.status === "CLOSED" ? "ticket.closed.v1" : "ticket.reopened.v1",
        actorType: data.closedBy === "USER" ? "USER" : "STAFF",
        sourceType: "HUMAN",
        visibility: "PUBLIC",
        fromStatus: ticket.lifecycleStatus ?? "UNASSIGNED",
        toStatus:
          data.status === "CLOSED"
            ? "CLOSED_LEGACY"
            : !destinationRoute && ticket.ownerUserId
              ? "IN_PROGRESS"
              : "UNASSIGNED",
        actorUserId: data.actorUserId ?? null,
        reason: data.closedReason ?? null,
        metadata: { adapter: "legacy-v1", legacyStatus: data.status },
        occurredAt,
      });
    }

    if (destinationDepartmentName) {
      await transaction.notification.create({
        data: {
          ticket: { connect: { id: ticket.id } },
          ...(ticket.userId ? { user: { connect: { id: ticket.userId } } } : {}),
          recipientType: "USER",
          message: `تیکت ${ticket.ticketId} توسط ${ticket.userName} به دپارتمان ${destinationDepartmentName} منتقل شد`,
        },
      });
    }

    return updated;
  });
}

export async function deleteTicketForRetention(ticketId: string) {
  await runSerializableTransaction(async (transaction) => {
    const ticket = await transaction.ticket.findUnique({
      where: { ticketId },
      select: {
        id: true,
        attachments: { select: { storageKey: true, fileUrl: true } },
        replies: {
          select: {
            attachments: { select: { storageKey: true, fileUrl: true } },
          },
        },
      },
    });
    if (!ticket) throw notFoundError(errors.TICKET_NOT_FOUND);

    await queueAttachmentDeletionJobs(transaction, [
      ...ticket.attachments,
      ...ticket.replies.flatMap((reply) => reply.attachments),
    ]);
    try {
      await transaction.ticket.delete({ where: { id: ticket.id } });
    } catch (error) {
      rethrowPersistenceError(error, { notFound: errors.TICKET_NOT_FOUND });
    }
  });

  const cleanup = await processAttachmentDeletionJobs(100);
  if (cleanup.failed > 0) {
    logOperationalWarning("attachment_deletion_jobs_queued", {
      failedCount: cleanup.failed,
    });
  }
}

export async function rateTicket(
  ticketId: string,
  rating: number,
  actorUserId?: number
) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw validationError(errors.RATING_RANGE);
  }

  return runSerializableTransaction(async (transaction) => {
    const result = await transaction.ticket.updateMany({
      where: { ticketId, rating: null },
      data: { rating, version: { increment: 1 } },
    });
    if (result.count === 1) {
      const ticket = await transaction.ticket.findUnique({
        where: { ticketId },
        select: { id: true, ticketId: true },
      });
      if (ticket) {
        await appendTicketEvent(transaction, {
          ticketInternalId: ticket.id,
          ticketPublicId: ticket.ticketId,
          type: "ticket.rated.v1",
          actorType: "USER",
          sourceType: "HUMAN",
          visibility: "INTERNAL",
          actorUserId: actorUserId ?? null,
          metadata: { rating, adapter: "legacy-v1" },
        });
      }
      return { rating };
    }

    const ticket = await transaction.ticket.findUnique({
      where: { ticketId },
      select: { id: true },
    });
    if (!ticket) throw notFoundError(errors.TICKET_NOT_FOUND);
    throw conflictError(errors.TICKET_ALREADY_RATED);
  });
}

interface ReplyData {
  senderType: "USER" | "ADMIN";
  senderName: string;
  message: string;
  attachments?: AttachmentReference[];
  attachmentUploaderId?: number;
  actorUserId?: number;
}

export async function addReply(ticketId: string, data: ReplyData) {
  const { senderType, senderName, message, attachments } = data;
  if (!senderType || !senderName || !message) {
    throw validationError(errors.ALL_FIELDS_REQUIRED);
  }
  if (senderType !== "USER" && senderType !== "ADMIN") {
    throw validationError(errors.INVALID_SENDER_TYPE);
  }
  if (attachments?.length && !data.attachmentUploaderId) {
    throw validationError(errors.FILE_REFERENCE_INVALID);
  }

  return runSerializableTransaction(async (transaction) => {
    const ticket = await transaction.ticket.findUnique({ where: { ticketId } });
    if (!ticket) throw notFoundError(errors.TICKET_NOT_FOUND);
    if (ticket.status === "CLOSED") throw conflictError(errors.TICKET_CLOSED);
    const occurredAt = new Date();

    const currentLifecycle = ticket.lifecycleStatus ?? "UNASSIGNED";
    let nextLifecycle: TicketLifecycleStatus = currentLifecycle;
    let nextOwnerUserId = ticket.ownerUserId;
    if (senderType === "ADMIN") {
      nextOwnerUserId = data.actorUserId ?? ticket.ownerUserId;
      nextLifecycle = nextOwnerUserId ? "IN_PROGRESS" : "UNASSIGNED";
    } else if (currentLifecycle === "WAITING_USER") {
      nextLifecycle = ticket.ownerUserId ? "IN_PROGRESS" : "UNASSIGNED";
    }

    const statusUpdate = await transaction.ticket.updateMany({
      where: { id: ticket.id, status: { not: "CLOSED" } },
      data: {
        status: "IN_PROGRESS",
        lifecycleStatus: nextLifecycle,
        ownerUserId: nextOwnerUserId,
        version: { increment: 1 },
      },
    });
    if (statusUpdate.count !== 1) throw conflictError(errors.TICKET_CLOSED);

    const reply = await transaction.ticketReply.create({
      data: {
        ticketId: ticket.id,
        senderType,
        senderName,
        message,
      },
    });

    const canonicalMessage = await transaction.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        visibility: "PUBLIC",
        authorType: senderType === "USER" ? "CUSTOMER" : "STAFF",
        actorUserId: data.actorUserId ?? null,
        authorPartyId: senderType === "USER" ? ticket.partyId : null,
        authorSnapshot: senderName,
        body: message,
      },
    });
    if (senderType === "ADMIN") {
      await markTicketFirstResponse(transaction, ticket.id, occurredAt);
    }
    await appendTicketEvent(transaction, {
      ticketInternalId: ticket.id,
      ticketPublicId: ticket.ticketId,
      type: "ticket.public_message_added.v1",
      actorType: senderType === "USER" ? "USER" : "STAFF",
      sourceType: "HUMAN",
      visibility: "PUBLIC",
      fromStatus: currentLifecycle,
      toStatus: nextLifecycle,
      actorUserId: data.actorUserId ?? null,
      metadata: { adapter: "legacy-v1" },
      occurredAt,
    });
    if (senderType !== "ADMIN" && currentLifecycle === "WAITING_USER") {
      await resumeTicketResolutionSla(transaction, {
        ticketId: ticket.id,
        ticketPublicId: ticket.ticketId,
        occurredAt,
        actorUserId: data.actorUserId ?? null,
        actorType: "USER",
        sourceType: "HUMAN",
      });
      await appendTicketEvent(transaction, {
        ticketInternalId: ticket.id,
        ticketPublicId: ticket.ticketId,
        type: "ticket.customer_replied.v1",
        actorType: "USER",
        sourceType: "HUMAN",
        visibility: "INTERNAL",
        fromStatus: "WAITING_USER",
        toStatus: nextLifecycle,
        actorUserId: data.actorUserId ?? null,
        metadata: { adapter: "legacy-v1" },
        occurredAt,
      });
    }
    if (senderType === "ADMIN" && nextOwnerUserId) {
      await transaction.ticketAssignment.updateMany({
        where: { ticketId: ticket.id, endedAt: null },
        data: { ownerUserId: nextOwnerUserId },
      });
    }

    if (attachments?.length && data.attachmentUploaderId) {
      await claimPendingUploads(
        transaction,
        attachments,
        data.attachmentUploaderId,
        {
          kind: "message",
          messageId: canonicalMessage.id,
          replyId: reply.id,
        }
      );
    }

    const recipientType = senderType === "USER" ? "ADMIN" : "USER";
    await transaction.notification.create({
      data: {
        ticket: { connect: { id: ticket.id } },
        ...(senderType === "ADMIN" && ticket.userId
          ? { user: { connect: { id: ticket.userId } } }
          : {}),
        recipientType,
        message: `پاسخ جدید توسط ${senderName} در تیکت ${ticket.ticketId} اضافه شد`,
      },
    });

    const savedReply = await transaction.ticketReply.findUnique({
      where: { id: reply.id },
      include: { attachments: { select: publicAttachmentSelect } },
    });
    if (!savedReply) throw notFoundError(errors.TICKET_NOT_FOUND);

    return {
      ...savedReply,
      attachments: savedReply.attachments.map(toAttachmentDto),
    };
  });
}
