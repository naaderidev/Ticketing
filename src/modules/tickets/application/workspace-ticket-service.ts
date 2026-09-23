import { createHash } from "node:crypto";
import {
  Prisma,
  type SupportPriority,
  type TicketLifecycleStatus,
} from "@prisma/client";
import type { CurrentUser } from "@/lib/current-user";
import { claimPendingUploads } from "@/lib/attachment-service";
import { publicAttachmentSelect, toAttachmentDto } from "@/lib/attachment-dto";
import { runSerializableTransaction } from "@/lib/database-transaction";
import { getPersistenceErrorCode, notFoundError } from "@/lib/domain-error";
import { prisma } from "@/lib/prisma";
import { hashSecurityValue } from "@/lib/request-security";
import {
  markTicketFirstResponse,
  markTicketResolved,
  excludeTicketSlaAfterLegacyClosure,
  pauseTicketResolutionSla,
  recordRoutingDecision,
  toPublicSlaDto,
} from "@/modules/sla-routing/application/sla-service";
import { SUPPORT_PERMISSIONS } from "@/modules/support-catalog/application/support-authorization";
import { decodeTicketCursor, encodeTicketCursor } from "@/modules/tickets/application/ticket-cursor";
import { appendTicketEvent } from "@/modules/tickets/application/ticket-event-outbox";
import type { TicketDomainEventType } from "@/modules/tickets/contracts/ticket-domain-events";
import { startTicketResolutionCycle } from "@/modules/tickets/application/ticket-lifecycle-service";
import type {
  AddWorkspaceCollaboratorInput,
  AssignWorkspaceTicketInput,
  CancelWorkspaceWorkItemInput,
  ChangeWorkspaceTicketPriorityInput,
  CompleteWorkspaceWorkItemInput,
  DecideAccountReviewInput,
  MergeWorkspaceTicketInput,
  ResolveWorkspaceTicketInput,
  TransferWorkspaceTicketInput,
  WorkspaceMessageInput,
  WorkspaceTicketListQuery,
  WorkspaceRootCauseQuery,
} from "@/modules/tickets/contracts/workspace-ticket-schemas";
import { TicketCommandError } from "@/modules/tickets/domain/ticket-command-error";
import { canTransitionTicket } from "@/modules/tickets/domain/ticket-state-machine";
import { requireExpectedTicketVersion } from "@/modules/tickets/domain/ticket-version";

const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
const COMMAND_ROUTE_PREFIX = "POST /api/v2/workspace/tickets/:ticketId";

type DatabaseClient = Prisma.TransactionClient | typeof prisma;
type PermissionKey = (typeof SUPPORT_PERMISSIONS)[keyof typeof SUPPORT_PERMISSIONS];

type AccessSnapshot = {
  actorUserId: number;
  permissions: Map<string, Set<number> | "GLOBAL">;
};

const workspaceTicketInclude = {
  party: { select: { id: true, displayName: true, type: true } },
  organization: { select: { id: true, legalName: true } },
  requestType: {
    select: {
      code: true,
      name: true,
      requiresRootCause: true,
      service: { select: { code: true, name: true } },
    },
  },
  supportTeam: { select: { id: true, code: true, name: true } },
  queue: { select: { id: true, code: true, name: true } },
  ownerUser: { select: { id: true, firstName: true, lastName: true } },
  servicePlan: {
    select: {
      id: true,
      name: true,
      contractReferenceKey: true,
      firstResponseMinutes: true,
      resolutionMinutes: true,
      accountManagerUserId: true,
    },
  },
  accountReview: {
    select: {
      status: true,
      accountManagerUserId: true,
      requestedAt: true,
      decidedAt: true,
      decisionNote: true,
    },
  },
  messages: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      visibility: true,
      authorType: true,
      authorSnapshot: true,
      body: true,
      createdAt: true,
      attachments: { select: publicAttachmentSelect },
    },
  },
  assignments: {
    orderBy: { startedAt: "desc" as const },
    select: {
      id: true,
      reason: true,
      startedAt: true,
      endedAt: true,
      supportTeam: { select: { id: true, name: true } },
      queue: { select: { id: true, name: true } },
      ownerUser: { select: { id: true, firstName: true, lastName: true } },
      assignedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  workItems: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      request: true,
      response: true,
      status: true,
      createdAt: true,
      completedAt: true,
      supportTeam: { select: { id: true, name: true } },
      queue: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, firstName: true, lastName: true } },
      requestedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  businessReferences: {
    select: {
      referenceType: true,
      referenceKey: true,
      displayLabel: true,
      verificationStatus: true,
    },
  },
  sla: {
    select: {
      policyCode: true,
      policyVersion: true,
      enforcementMode: true,
      firstResponseState: true,
      resolutionState: true,
      firstResponseWarningLevel: true,
      resolutionWarningLevel: true,
      resolutionEscalationLevel: true,
      firstResponseDueAt: true,
      resolutionDueAt: true,
      pausedAt: true,
      resolutionCycleNumber: true,
      resolutionCycleStartedAt: true,
    },
  },
  resolutionCycles: {
    where: { outcome: "PENDING" as const },
    take: 1,
    select: { sequence: true, proposedAt: true, reminderOneAt: true, reminderTwoAt: true, autoCloseAt: true, reminderCount: true },
  },
  normalizedRootCause: {
    select: { id: true, code: true, name: true, serviceCode: true },
  },
  mergedIntoTicket: {
    select: { ticketId: true, subject: true },
  },
  mergedTickets: {
    orderBy: { mergedAt: "desc" as const },
    select: { ticketId: true, subject: true, mergedAt: true, mergeReason: true },
  },
} satisfies Prisma.TicketInclude;

type WorkspaceTicketRecord = Prisma.TicketGetPayload<{
  include: typeof workspaceTicketInclude;
}>;

function personName(person: { firstName: string; lastName: string } | null) {
  return person ? `${person.firstName} ${person.lastName}`.trim() : null;
}

async function getAccess(
  client: DatabaseClient,
  actorUserId: number,
  now = new Date()
): Promise<AccessSnapshot> {
  const assignments = await client.userRoleAssignment.findMany({
    where: {
      userId: actorUserId,
      status: "ACTIVE",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
    },
    select: {
      supportTeamId: true,
      scopeType: true,
      scopeKey: true,
      role: { select: { permissions: { select: { permission: { select: { key: true } } } } } },
    },
  });
  const permissions = new Map<string, Set<number> | "GLOBAL">();
  for (const assignment of assignments) {
    for (const grant of assignment.role.permissions) {
      const key = grant.permission.key;
      if (assignment.scopeType === "GLOBAL" && assignment.scopeKey === "*") {
        permissions.set(key, "GLOBAL");
      } else if (assignment.scopeType === "SUPPORT_TEAM" && assignment.supportTeamId) {
        const current = permissions.get(key);
        if (current !== "GLOBAL") {
          const teams = current ?? new Set<number>();
          teams.add(assignment.supportTeamId);
          permissions.set(key, teams);
        }
      }
    }
  }
  return { actorUserId, permissions };
}

function hasPermission(access: AccessSnapshot, key: PermissionKey, teamId?: number | null) {
  const grant = access.permissions.get(key);
  if (grant === "GLOBAL") return true;
  return teamId !== undefined && teamId !== null && Boolean(grant?.has(teamId));
}

function intersectPermissionScopes(
  access: AccessSnapshot,
  firstPermission: PermissionKey,
  secondPermission: PermissionKey,
): number[] | null {
  const firstGrant = access.permissions.get(firstPermission);
  const secondGrant = access.permissions.get(secondPermission);

  if (!firstGrant || !secondGrant) return [];
  if (firstGrant === "GLOBAL") {
    return secondGrant === "GLOBAL" ? null : [...secondGrant];
  }
  if (secondGrant === "GLOBAL") return [...firstGrant];

  return [...firstGrant].filter((teamId) => secondGrant.has(teamId));
}

function workspaceReadableTeams(access: AccessSnapshot): number[] | null {
  return intersectPermissionScopes(
    access,
    SUPPORT_PERMISSIONS.WORKSPACE_ACCESS,
    SUPPORT_PERMISSIONS.TICKET_READ,
  );
}

function requireWorkspaceRead(access: AccessSnapshot) {
  const readableTeams = workspaceReadableTeams(access);
  if (readableTeams !== null && readableTeams.length === 0) {
    throw notFoundError("فضای کاری یافت نشد");
  }
}

function scopedTeams(access: AccessSnapshot, permission: PermissionKey): number[] | null {
  const grant = access.permissions.get(permission);
  if (grant === "GLOBAL") return null;
  return [...(grant ?? [])];
}

function ticketScopeWhere(access: AccessSnapshot): Prisma.TicketWhereInput {
  const teams = workspaceReadableTeams(access);
  return teams === null
    ? {}
    : {
        OR: [
          { supportTeamId: { in: teams } },
          { workItems: { some: { supportTeamId: { in: teams }, status: "OPEN" } } },
        ],
      };
}

function capabilities(access: AccessSnapshot, teamId: number | null, collaboratorTeamIds: number[] = []) {
  const collaboratorCanReply = collaboratorTeamIds.some((id) => hasPermission(access, SUPPORT_PERMISSIONS.TICKET_REPLY, id));
  return {
    assign: hasPermission(access, SUPPORT_PERMISSIONS.TICKET_ASSIGN, teamId),
    transfer: hasPermission(access, SUPPORT_PERMISSIONS.TICKET_TRANSFER, teamId),
    reply: hasPermission(access, SUPPORT_PERMISSIONS.TICKET_REPLY, teamId),
    internalNote: hasPermission(access, SUPPORT_PERMISSIONS.TICKET_REPLY, teamId) || collaboratorCanReply,
    requestCustomerInput: hasPermission(access, SUPPORT_PERMISSIONS.TICKET_REPLY, teamId),
    resolve: hasPermission(access, SUPPORT_PERMISSIONS.TICKET_RESOLVE, teamId),
    changePriority: hasPermission(access, SUPPORT_PERMISSIONS.TICKET_RESOLVE, teamId),
    collaborate: hasPermission(access, SUPPORT_PERMISSIONS.TICKET_REPLY, teamId),
    merge: hasPermission(access, SUPPORT_PERMISSIONS.TICKET_RESOLVE, teamId),
  };
}

function toWorkspaceTicketDto(ticket: WorkspaceTicketRecord, access: AccessSnapshot) {
  if (!ticket.lifecycleStatus || !ticket.priority || !ticket.requestType) {
    throw notFoundError("تیکت یافت نشد");
  }
  return {
    ticketId: ticket.ticketId,
    subject: ticket.subject,
    status: ticket.lifecycleStatus,
    priority: ticket.priority,
    version: ticket.version,
    customer: ticket.party,
    organization: ticket.organization,
    requestType: ticket.requestType,
    supportTeam: ticket.supportTeam,
    queue: ticket.queue,
    owner: ticket.ownerUser ? { id: ticket.ownerUser.id, name: personName(ticket.ownerUser)! } : null,
    rootCause: ticket.rootCause,
    normalizedRootCause: ticket.normalizedRootCause,
    resolutionSummary: ticket.resolutionSummary,
    actionTaken: ticket.actionTaken,
    finalResponse: ticket.finalResponse,
    rating: ticket.rating,
    servicePlan: ticket.servicePlan,
    accountReview: ticket.accountReview
      ? {
          ...ticket.accountReview,
          requestedAt: ticket.accountReview.requestedAt.toISOString(),
          decidedAt: ticket.accountReview.decidedAt?.toISOString() ?? null,
        }
      : null,
    businessReferences: ticket.businessReferences,
    organizationRole: null,
    customerHistory: [],
    mergedInto: ticket.mergedIntoTicket,
    mergedTickets: ticket.mergedTickets.map((item) => ({
      ...item,
      mergedAt: item.mergedAt?.toISOString() ?? null,
    })),
    sla: toPublicSlaDto(ticket.sla),
    resolutionCycle: ticket.resolutionCycles[0]
      ? {
          ...ticket.resolutionCycles[0],
          proposedAt: ticket.resolutionCycles[0].proposedAt.toISOString(),
          reminderOneAt: ticket.resolutionCycles[0].reminderOneAt.toISOString(),
          reminderTwoAt: ticket.resolutionCycles[0].reminderTwoAt.toISOString(),
          autoCloseAt: ticket.resolutionCycles[0].autoCloseAt.toISOString(),
        }
      : null,
    messages: ticket.messages.map((message) => ({
      id: message.id.toString(),
      visibility: message.visibility,
      authorType: message.authorType,
      authorLabel: message.authorSnapshot,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      attachments: message.attachments.map(toAttachmentDto),
    })),
    assignments: ticket.assignments.map((assignment) => ({
      id: assignment.id.toString(),
      reason: assignment.reason,
      startedAt: assignment.startedAt.toISOString(),
      endedAt: assignment.endedAt?.toISOString() ?? null,
      supportTeam: assignment.supportTeam,
      queue: assignment.queue,
      owner: assignment.ownerUser ? { id: assignment.ownerUser.id, name: personName(assignment.ownerUser)! } : null,
      assignedBy: assignment.assignedBy ? { id: assignment.assignedBy.id, name: personName(assignment.assignedBy)! } : null,
    })),
    workItems: ticket.workItems.map((item) => ({
      id: item.id.toString(),
      request: item.request,
      response: item.response,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      completedAt: item.completedAt?.toISOString() ?? null,
      supportTeam: item.supportTeam,
      queue: item.queue,
      assignedUser: item.assignedUser ? { id: item.assignedUser.id, name: personName(item.assignedUser)! } : null,
      requestedBy: { id: item.requestedBy.id, name: personName(item.requestedBy)! },
      capabilities: {
        complete:
          item.status === "OPEN" &&
          hasPermission(access, SUPPORT_PERMISSIONS.TICKET_REPLY, item.supportTeam.id) &&
          (scopedTeams(access, SUPPORT_PERMISSIONS.TICKET_REPLY) === null ||
            !item.assignedUser ||
            item.assignedUser.id === access.actorUserId),
        cancel:
          item.status === "OPEN" &&
          (item.requestedBy.id === access.actorUserId ||
            hasPermission(access, SUPPORT_PERMISSIONS.TICKET_REPLY, ticket.supportTeamId)),
      },
    })),
    capabilities: {
      ...capabilities(
        access,
        ticket.supportTeamId,
        ticket.workItems.filter((item) => item.status === "OPEN").map((item) => item.supportTeam.id)
      ),
      merge:
        hasPermission(access, SUPPORT_PERMISSIONS.TICKET_RESOLVE, ticket.supportTeamId) &&
        !ticket.mergedIntoTicketId &&
        !["RESOLVED", "CLOSED", "CLOSED_LEGACY"].includes(ticket.lifecycleStatus),
      accountReview:
        ticket.accountReview?.status === "PENDING" &&
        ticket.accountReview.accountManagerUserId === access.actorUserId,
    },
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

export async function listWorkspaceTickets(input: {
  actorUserId: number;
  query: WorkspaceTicketListQuery;
}) {
  const access = await getAccess(prisma, input.actorUserId);
  requireWorkspaceRead(access);
  const cursor = input.query.cursor ? decodeTicketCursor(input.query.cursor) : null;
  const where: Prisma.TicketWhereInput = {
    AND: [
      ticketScopeWhere(access),
      {
        lifecycleStatus: input.query.status ?? { not: null },
        priority: input.query.priority ?? { not: null },
        ...(input.query.slaStatus
          ? slaStatusWhere(input.query.slaStatus)
          : {}),
        ...(input.query.queueId ? { queueId: input.query.queueId } : {}),
        ...(input.query.ownership === "MINE" ? { ownerUserId: input.actorUserId } : {}),
        ...(input.query.ownership === "UNASSIGNED" ? { ownerUserId: null } : {}),
      },
      ...(cursor
        ? [{ OR: [{ updatedAt: { lt: cursor.updatedAt } }, { updatedAt: cursor.updatedAt, id: { lt: cursor.id } }] }]
        : []),
    ],
  };
  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: input.query.limit + 1,
    select: {
      id: true, ticketId: true, subject: true, lifecycleStatus: true,
      priority: true, version: true, updatedAt: true, createdAt: true,
      supportTeamId: true,
      requestType: { select: { code: true, name: true, service: { select: { code: true, name: true } } } },
      supportTeam: { select: { id: true, code: true, name: true } },
      queue: { select: { id: true, code: true, name: true } },
      ownerUser: { select: { id: true, firstName: true, lastName: true } },
      sla: { select: {
        firstResponseState: true,
        resolutionState: true,
        firstResponseWarningLevel: true,
        resolutionWarningLevel: true,
        resolutionEscalationLevel: true,
        firstResponseDueAt: true,
        resolutionDueAt: true,
        pausedAt: true,
        resolutionCycleNumber: true,
        resolutionCycleStartedAt: true,
      } },
      workItems: { where: { status: "OPEN" }, select: { supportTeamId: true } },
    },
  });
  const hasMore = tickets.length > input.query.limit;
  const page = tickets.slice(0, input.query.limit);
  const last = page.at(-1);
  return {
    tickets: page.map((ticket) => ({
      ticketId: ticket.ticketId,
      subject: ticket.subject,
      status: ticket.lifecycleStatus!,
      priority: ticket.priority!,
      version: ticket.version,
      requestType: ticket.requestType,
      supportTeam: ticket.supportTeam,
      queue: ticket.queue,
      owner: ticket.ownerUser ? { id: ticket.ownerUser.id, name: personName(ticket.ownerUser)! } : null,
      sla: ticket.sla ? {
        firstResponse: {
          state: ticket.sla.firstResponseState,
          dueAt: ticket.sla.firstResponseDueAt.toISOString(),
          warningLevel: ticket.sla.firstResponseWarningLevel,
        },
        resolution: {
          state: ticket.sla.resolutionState,
          dueAt: ticket.sla.resolutionDueAt.toISOString(),
          paused: ticket.sla.pausedAt !== null,
          warningLevel: ticket.sla.resolutionWarningLevel,
          escalationLevel: ticket.sla.resolutionEscalationLevel,
          cycleNumber: ticket.sla.resolutionCycleNumber,
          cycleStartedAt: ticket.sla.resolutionCycleStartedAt.toISOString(),
        },
      } : null,
      capabilities: capabilities(access, ticket.supportTeamId, ticket.workItems.map((item) => item.supportTeamId)),
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    })),
    page: {
      limit: input.query.limit,
      hasMore,
      nextCursor: hasMore && last ? encodeTicketCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id }) : null,
    },
  };
}

type WorkspaceSlaStatus = "AT_RISK" | "BREACHED" | "PAUSED";

function slaStatusWhere(status: WorkspaceSlaStatus): Prisma.TicketWhereInput {
  if (status === "BREACHED") {
    return {
      sla: {
        is: {
          OR: [
            { firstResponseState: "BREACHED" },
            { resolutionState: "BREACHED" },
          ],
        },
      },
    };
  }
  if (status === "PAUSED") {
    return { sla: { is: { resolutionState: "PAUSED" } } };
  }
  return {
    sla: {
      is: {
        OR: [
          {
            firstResponseState: "PENDING",
            firstResponseWarningLevel: { in: ["SEVENTY", "NINETY"] },
          },
          {
            resolutionState: "PENDING",
            resolutionWarningLevel: { in: ["SEVENTY", "NINETY"] },
          },
        ],
      },
    },
  };
}

export async function getWorkspaceSlaSummary(actorUserId: number) {
  const access = await getAccess(prisma, actorUserId);
  requireWorkspaceRead(access);
  const scope = ticketScopeWhere(access);
  const count = (status: WorkspaceSlaStatus) =>
    prisma.ticket.count({ where: { AND: [scope, slaStatusWhere(status)] } });
  const activeStatuses: TicketLifecycleStatus[] = [
    "NEW", "UNASSIGNED", "IN_PROGRESS", "INTERNAL_REFERRAL",
    "WAITING_INTERNAL", "WAITING_USER", "REOPENED",
  ];
  const [breached, atRisk, paused, newCount, urgent, waitingUser, waitingInternal, unassigned, reopened] = await Promise.all([
    count("BREACHED"),
    count("AT_RISK"),
    count("PAUSED"),
    prisma.ticket.count({ where: { AND: [scope, { lifecycleStatus: "NEW" }] } }),
    prisma.ticket.count({ where: { AND: [scope, { lifecycleStatus: { in: activeStatuses }, priority: "CRITICAL" }] } }),
    prisma.ticket.count({ where: { AND: [scope, { lifecycleStatus: "WAITING_USER" }] } }),
    prisma.ticket.count({ where: { AND: [scope, { lifecycleStatus: "WAITING_INTERNAL" }] } }),
    prisma.ticket.count({ where: { AND: [scope, { lifecycleStatus: { in: activeStatuses }, ownerUserId: null }] } }),
    prisma.ticket.count({ where: { AND: [scope, { lifecycleStatus: "REOPENED" }] } }),
  ]);
  return { breached, atRisk, paused, new: newCount, urgent, waitingUser, waitingInternal, unassigned, reopened };
}

export async function listWorkspaceRootCauses(input: {
  actorUserId: number;
  query: WorkspaceRootCauseQuery;
}) {
  const access = await getAccess(prisma, input.actorUserId);
  requireWorkspaceRead(access);
  return prisma.reportingRootCauseDimension.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ serviceCode: input.query.serviceCode }, { serviceCode: null }],
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, code: true, name: true, serviceCode: true },
  });
}

export async function getWorkspaceTicket(actorUserId: number, ticketId: string) {
  const access = await getAccess(prisma, actorUserId);
  requireWorkspaceRead(access);
  const ticket = await prisma.ticket.findFirst({
    where: { ticketId, ...ticketScopeWhere(access) },
    include: workspaceTicketInclude,
  });
  if (!ticket) throw notFoundError("تیکت یافت نشد");
  const sharedReferences = ticket.businessReferences.map((reference) => ({
    referenceType: reference.referenceType,
    referenceKey: reference.referenceKey,
  }));
  const [relatedHistory, customerHistory, organizationMembership] = await Promise.all([
    sharedReferences.length
      ? prisma.ticket.findMany({
        where: {
          id: { not: ticket.id },
          ...ticketScopeWhere(access),
          businessReferences: { some: { OR: sharedReferences } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          ticketId: true,
          subject: true,
          lifecycleStatus: true,
          resolutionSummary: true,
          createdAt: true,
        },
      })
      : Promise.resolve([]),
    ticket.partyId
      ? prisma.ticket.findMany({
          where: {
            id: { not: ticket.id },
            partyId: ticket.partyId,
            ...ticketScopeWhere(access),
          },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            ticketId: true,
            subject: true,
            lifecycleStatus: true,
            resolutionSummary: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    ticket.organizationId && ticket.createdById
      ? prisma.organizationMembership.findFirst({
          where: {
            organizationId: ticket.organizationId,
            userId: ticket.createdById,
            status: "ACTIVE",
            validFrom: { lte: new Date() },
            OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
          },
          select: { role: true },
        })
      : Promise.resolve(null),
  ]);
  const toHistoryItem = (item: (typeof customerHistory)[number]) => ({
    ticketId: item.ticketId,
    subject: item.subject,
    status: item.lifecycleStatus,
    resolutionSummary: item.resolutionSummary,
    createdAt: item.createdAt.toISOString(),
  });
  return {
    ...toWorkspaceTicketDto(ticket, access),
    organizationRole: organizationMembership?.role ?? null,
    relatedHistory: relatedHistory.map(toHistoryItem),
    customerHistory: customerHistory.map(toHistoryItem),
  };
}

type CommandContext = {
  transaction: Prisma.TransactionClient;
  ticket: WorkspaceTicketRecord;
  access: AccessSnapshot;
  actorUserId: number;
  actorName: string;
  now: Date;
};

async function executeCommand<T>(input: {
  user: CurrentUser;
  ticketId: string;
  command: T;
  route: string;
  permission: PermissionKey;
  allowCollaborator?: boolean;
  idempotencyKey: string;
  ifMatch: string | null;
  mutate: (context: CommandContext) => Promise<void>;
}) {
  const keyHash = hashSecurityValue("workspace-ticket-command-key", input.idempotencyKey);
  const payloadHash = createHash("sha256").update(JSON.stringify({ ticketId: input.ticketId, command: input.command })).digest("hex");
  const now = new Date();
  try {
    return await runSerializableTransaction(async (transaction) => {
      const session = await transaction.session.findFirst({
        where: { id: input.user.sessionId, userId: input.user.id, revokedAt: null, expiresAt: { gt: now }, absoluteExpiresAt: { gt: now } },
        select: { activePartyId: true, user: { select: { personProfile: { select: { partyId: true } } } } },
      });
      const partyId = session?.activePartyId ?? session?.user.personProfile?.partyId;
      if (!partyId) throw notFoundError("نشست کاری یافت نشد");
      const access = await getAccess(transaction, input.user.id, now);
      requireWorkspaceRead(access);
      await transaction.ticketCommandReceipt.deleteMany({
        where: { actorUserId: input.user.id, partyId, route: input.route, keyHash, expiresAt: { lte: now } },
      });
      const receipt = await transaction.ticketCommandReceipt.create({
        data: { actorUserId: input.user.id, partyId, route: input.route, keyHash, payloadHash, expiresAt: new Date(now.getTime() + RECEIPT_TTL_MS) },
      });
      const ticket = await transaction.ticket.findFirst({
        where: { ticketId: input.ticketId, ...ticketScopeWhere(access) },
        include: workspaceTicketInclude,
      });
      if (!ticket?.lifecycleStatus || !ticket.priority) throw notFoundError("تیکت یافت نشد");
      const hasPrimaryPermission = hasPermission(access, input.permission, ticket.supportTeamId);
      const hasCollaboratorPermission = Boolean(
        input.allowCollaborator &&
          ticket.workItems.some(
            (item) =>
              item.status === "OPEN" &&
              hasPermission(access, input.permission, item.supportTeam.id)
          )
      );
      if (!hasPrimaryPermission && !hasCollaboratorPermission) throw notFoundError("تیکت یافت نشد");
      requireExpectedTicketVersion(ticket.ticketId, ticket.version, input.ifMatch);
      await input.mutate({ transaction, ticket, access, actorUserId: input.user.id, actorName: `${input.user.firstName} ${input.user.lastName}`.trim(), now });
      const saved = await transaction.ticket.findUnique({ where: { id: ticket.id }, include: workspaceTicketInclude });
      if (!saved) throw notFoundError("تیکت یافت نشد");
      const dto = toWorkspaceTicketDto(saved, access);
      await transaction.ticketCommandReceipt.update({
        where: { id: receipt.id },
        data: { ticketId: ticket.id, status: "SUCCEEDED", responseStatus: 200, responseBody: JSON.parse(JSON.stringify(dto)) },
      });
      return { ticket: dto, replayed: false };
    });
  } catch (error) {
    if (getPersistenceErrorCode(error) !== "P2002") throw error;
    const session = await prisma.session.findUnique({ where: { id: input.user.sessionId }, select: { activePartyId: true, user: { select: { personProfile: { select: { partyId: true } } } } } });
    const partyId = session?.activePartyId ?? session?.user.personProfile?.partyId;
    if (!partyId) throw error;
    const receipt = await prisma.ticketCommandReceipt.findUnique({
      where: { actorUserId_partyId_route_keyHash: { actorUserId: input.user.id, partyId, route: input.route, keyHash } },
      select: { payloadHash: true, status: true, ticketId: true },
    });
    if (!receipt) throw error;
    if (receipt.payloadHash !== payloadHash) throw new TicketCommandError("کلید تکرار با محتوای متفاوت استفاده شده است", "IDEMPOTENCY_KEY_REUSED", 409);
    if (receipt.status !== "SUCCEEDED" || !receipt.ticketId) throw new TicketCommandError("درخواست قبلی هنوز در حال پردازش است", "IDEMPOTENCY_IN_PROGRESS", 409);
    const access = await getAccess(prisma, input.user.id);
    requireWorkspaceRead(access);
    const saved = await prisma.ticket.findFirst({ where: { id: receipt.ticketId, ...ticketScopeWhere(access) }, include: workspaceTicketInclude });
    if (!saved) throw notFoundError("تیکت یافت نشد");
    return { ticket: toWorkspaceTicketDto(saved, access), replayed: true };
  }
}

function nextWorkingStatus(status: TicketLifecycleStatus): TicketLifecycleStatus {
  return ["NEW", "UNASSIGNED", "REOPENED", "INTERNAL_REFERRAL", "WAITING_INTERNAL"].includes(status) ? "IN_PROGRESS" : status;
}

async function requirePrimaryOwnerForTeam(
  transaction: Prisma.TransactionClient,
  supportTeamId: number,
  now: Date,
) {
  const assignment = await transaction.userRoleAssignment.findFirst({
    where: {
      supportTeamId,
      scopeType: "SUPPORT_TEAM",
      scopeKey: String(supportTeamId),
      status: "ACTIVE",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
      role: {
        permissions: {
          some: { permission: { key: SUPPORT_PERMISSIONS.TICKET_READ } },
        },
      },
    },
    orderBy: [{ userId: "asc" }, { id: "asc" }],
    select: { userId: true },
  });
  if (!assignment) {
    throw new TicketCommandError(
      "برای تیم مقصد مالک فعال تعریف نشده است",
      "BUSINESS_RULE_VIOLATION",
      422,
    );
  }
  return assignment.userId;
}

async function updateTicketVersion(
  transaction: Prisma.TransactionClient,
  ticket: WorkspaceTicketRecord,
  data: Prisma.TicketUncheckedUpdateManyInput
) {
  const updated = await transaction.ticket.updateMany({ where: { id: ticket.id, version: ticket.version }, data: { ...data, version: { increment: 1 } } });
  if (updated.count !== 1) throw new TicketCommandError("تیکت هم‌زمان تغییر کرده است؛ اطلاعات را تازه‌سازی کنید", "CONCURRENT_MODIFICATION", 409);
}

export function assignWorkspaceTicket(input: { user: CurrentUser; ticketId: string; command: AssignWorkspaceTicketInput; idempotencyKey: string; ifMatch: string | null }) {
  return executeCommand({ ...input, route: `${COMMAND_ROUTE_PREFIX}/assign`, permission: SUPPORT_PERMISSIONS.TICKET_ASSIGN, mutate: async ({ transaction, ticket, actorUserId, now }) => {
    if (!ticket.supportTeamId || !ticket.queueId) throw new TicketCommandError("تیکت فاقد صف معتبر است", "BUSINESS_RULE_VIOLATION", 422);
    const member = await transaction.userRoleAssignment.findFirst({ where: { userId: input.command.ownerUserId, supportTeamId: ticket.supportTeamId, status: "ACTIVE", validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }], role: { permissions: { some: { permission: { key: SUPPORT_PERMISSIONS.TICKET_READ } } } } }, select: { id: true } });
    if (!member) throw new TicketCommandError("مالک انتخاب‌شده عضو فعال تیم نیست", "BUSINESS_RULE_VIOLATION", 422);
    const nextStatus = nextWorkingStatus(ticket.lifecycleStatus!);
    await updateTicketVersion(transaction, ticket, { ownerUserId: input.command.ownerUserId, lifecycleStatus: nextStatus, status: "IN_PROGRESS" });
    await transaction.ticketAssignment.updateMany({ where: { ticketId: ticket.id, endedAt: null }, data: { endedAt: now, activeKey: null } });
    await transaction.ticketAssignment.create({ data: { ticketId: ticket.id, supportTeamId: ticket.supportTeamId, queueId: ticket.queueId, ownerUserId: input.command.ownerUserId, assignedById: actorUserId, reason: input.command.reason, activeKey: String(ticket.id), startedAt: now } });
    await appendTicketEvent(transaction, { ticketInternalId: ticket.id, ticketPublicId: ticket.ticketId, type: "ticket.assigned.v1", actorType: "STAFF", sourceType: "HUMAN", fromStatus: ticket.lifecycleStatus, toStatus: nextStatus, actorUserId, reason: input.command.reason, metadata: { ownerUserId: input.command.ownerUserId } });
  } });
}

export function transferWorkspaceTicket(input: { user: CurrentUser; ticketId: string; command: TransferWorkspaceTicketInput; idempotencyKey: string; ifMatch: string | null }) {
  return executeCommand({ ...input, route: `${COMMAND_ROUTE_PREFIX}/transfer`, permission: SUPPORT_PERMISSIONS.TICKET_TRANSFER, mutate: async ({ transaction, ticket, access, actorUserId, now }) => {
    const queue = await transaction.supportQueue.findFirst({ where: { id: input.command.queueId, status: "ACTIVE", team: { status: "ACTIVE" } }, select: { id: true, teamId: true } });
    if (!queue || !hasPermission(access, SUPPORT_PERMISSIONS.TICKET_READ, queue.teamId)) throw notFoundError("صف مقصد یافت نشد");
    const ownerUserId = await requirePrimaryOwnerForTeam(transaction, queue.teamId, now);
    const nextStatus = nextWorkingStatus(ticket.lifecycleStatus!);
    await updateTicketVersion(transaction, ticket, { supportTeamId: queue.teamId, queueId: queue.id, ownerUserId, lifecycleStatus: nextStatus, status: "IN_PROGRESS" });
    await transaction.ticketAssignment.updateMany({ where: { ticketId: ticket.id, endedAt: null }, data: { endedAt: now, activeKey: null } });
    await transaction.ticketAssignment.create({ data: { ticketId: ticket.id, supportTeamId: queue.teamId, queueId: queue.id, ownerUserId, assignedById: actorUserId, reason: input.command.reason, activeKey: String(ticket.id), startedAt: now } });
    if (ticket.requestTypeId && ticket.priority && ticket.routeVersion) await recordRoutingDecision(transaction, { ticketId: ticket.id, requestTypeId: ticket.requestTypeId, supportTeamId: queue.teamId, queueId: queue.id, source: "MANUAL_OVERRIDE", routeVersion: ticket.routeVersion, priority: ticket.priority, actorUserId, reason: input.command.reason });
    await appendTicketEvent(transaction, { ticketInternalId: ticket.id, ticketPublicId: ticket.ticketId, type: "ticket.transferred.v1", actorType: "STAFF", sourceType: "HUMAN", fromStatus: ticket.lifecycleStatus, toStatus: nextStatus, actorUserId, reason: input.command.reason, metadata: { fromQueueId: ticket.queueId, toQueueId: queue.id, fromSupportTeamId: ticket.supportTeamId, toSupportTeamId: queue.teamId } });
    await appendTicketEvent(transaction, { ticketInternalId: ticket.id, ticketPublicId: ticket.ticketId, type: "ticket.assigned.v1", actorType: "STAFF", sourceType: "HUMAN", fromStatus: nextStatus, toStatus: nextStatus, actorUserId, reason: "تخصیص خودکار مالک اصلی پس از انتقال", metadata: { ownerUserId } });
  } });
}

async function addStaffMessage(context: CommandContext, command: WorkspaceMessageInput, visibility: "PUBLIC" | "INTERNAL", eventType: TicketDomainEventType, nextStatus: TicketLifecycleStatus) {
  const { transaction, ticket, actorUserId, now } = context;
  await updateTicketVersion(transaction, ticket, { lifecycleStatus: nextStatus, status: "IN_PROGRESS" });
  let legacyReplyId: number | undefined;
  if (visibility === "PUBLIC") {
    legacyReplyId = (await transaction.ticketReply.create({ data: { ticketId: ticket.id, senderType: "ADMIN", senderName: context.actorName, message: command.message } })).id;
  }
  const message = await transaction.ticketMessage.create({ data: { ticketId: ticket.id, visibility, authorType: "STAFF", actorUserId, authorSnapshot: context.actorName, body: command.message } });
  if (command.attachments.length) await claimPendingUploads(transaction, command.attachments, actorUserId, { kind: "message", messageId: message.id, ...(legacyReplyId ? { replyId: legacyReplyId } : {}) });
  if (visibility === "PUBLIC") {
    await markTicketFirstResponse(transaction, ticket.id, now);
  }
  await appendTicketEvent(transaction, { ticketInternalId: ticket.id, ticketPublicId: ticket.ticketId, type: eventType, actorType: "STAFF", sourceType: "HUMAN", visibility, fromStatus: ticket.lifecycleStatus, toStatus: nextStatus, actorUserId, occurredAt: now });
  if (visibility === "PUBLIC") await transaction.notification.create({ data: { ticketId: ticket.id, recipientType: "USER", message: `پاسخ جدید برای تیکت ${ticket.ticketId} ثبت شد` } });
}

export function addWorkspacePublicReply(input: { user: CurrentUser; ticketId: string; command: WorkspaceMessageInput; idempotencyKey: string; ifMatch: string | null }) {
  return executeCommand({ ...input, route: `${COMMAND_ROUTE_PREFIX}/public-replies`, permission: SUPPORT_PERMISSIONS.TICKET_REPLY, mutate: async (context) => {
    if (["RESOLVED", "CLOSED", "CLOSED_LEGACY", "WAITING_USER"].includes(context.ticket.lifecycleStatus!)) throw new TicketCommandError("پاسخ عمومی در وضعیت فعلی مجاز نیست", "INVALID_TRANSITION", 409);
    await addStaffMessage(context, input.command, "PUBLIC", "ticket.public_message_added.v1", nextWorkingStatus(context.ticket.lifecycleStatus!));
  } });
}

export function addWorkspaceInternalNote(input: { user: CurrentUser; ticketId: string; command: WorkspaceMessageInput; idempotencyKey: string; ifMatch: string | null }) {
  return executeCommand({ ...input, route: `${COMMAND_ROUTE_PREFIX}/internal-notes`, permission: SUPPORT_PERMISSIONS.TICKET_REPLY, allowCollaborator: true, mutate: (context) => addStaffMessage(context, input.command, "INTERNAL", "ticket.internal_note_added.v1", context.ticket.lifecycleStatus!) });
}

export function requestWorkspaceCustomerInput(input: { user: CurrentUser; ticketId: string; command: WorkspaceMessageInput; idempotencyKey: string; ifMatch: string | null }) {
  return executeCommand({ ...input, route: `${COMMAND_ROUTE_PREFIX}/request-customer-input`, permission: SUPPORT_PERMISSIONS.TICKET_REPLY, mutate: async (context) => {
    if (!canTransitionTicket(context.ticket.lifecycleStatus!, "WAITING_USER", "STAFF")) throw new TicketCommandError("درخواست اطلاعات در وضعیت فعلی مجاز نیست", "INVALID_TRANSITION", 409);
    await addStaffMessage(context, input.command, "PUBLIC", "ticket.customer_input_requested.v1", "WAITING_USER");
    await pauseTicketResolutionSla(context.transaction, { ticketId: context.ticket.id, ticketPublicId: context.ticket.ticketId, occurredAt: context.now, actorUserId: context.actorUserId, actorType: "STAFF", sourceType: "HUMAN" });
  } });
}

export function resolveWorkspaceTicket(input: { user: CurrentUser; ticketId: string; command: ResolveWorkspaceTicketInput; idempotencyKey: string; ifMatch: string | null }) {
  return executeCommand({ ...input, route: `${COMMAND_ROUTE_PREFIX}/resolve`, permission: SUPPORT_PERMISSIONS.TICKET_RESOLVE, mutate: async ({ transaction, ticket, actorUserId, now }) => {
    if (!canTransitionTicket(ticket.lifecycleStatus!, "RESOLVED", "STAFF")) throw new TicketCommandError("حل تیکت در وضعیت فعلی مجاز نیست", "INVALID_TRANSITION", 409);
    if (ticket.requestType?.requiresRootCause && !input.command.rootCause?.trim()) throw new TicketCommandError("ثبت علت ریشه‌ای برای این نوع درخواست الزامی است", "BUSINESS_RULE_VIOLATION", 422);
    if (ticket.requestType?.requiresRootCause && !input.command.normalizedRootCauseId) throw new TicketCommandError("انتخاب علت ریشه‌ای استاندارد الزامی است", "BUSINESS_RULE_VIOLATION", 422);
    const normalizedRootCause = input.command.normalizedRootCauseId
      ? await transaction.reportingRootCauseDimension.findFirst({
          where: {
            id: input.command.normalizedRootCauseId,
            status: "ACTIVE",
            OR: [
              { serviceCode: null },
              { serviceCode: ticket.requestType?.service.code },
            ],
          },
          select: { id: true },
        })
      : null;
    if (input.command.normalizedRootCauseId && !normalizedRootCause) throw new TicketCommandError("علت ریشه‌ای استاندارد با خدمت تیکت سازگار نیست", "BUSINESS_RULE_VIOLATION", 422);
    const requiresAccountReview = Boolean(ticket.servicePlan?.accountManagerUserId);
    const nextStatus = requiresAccountReview ? "WAITING_INTERNAL" : "RESOLVED";
    const resolutionSummary = `${input.command.actionTaken}\n\nپاسخ نهایی:\n${input.command.finalResponse}`;
    await updateTicketVersion(transaction, ticket, { lifecycleStatus: nextStatus, status: "IN_PROGRESS", resolutionSummary, actionTaken: input.command.actionTaken, finalResponse: input.command.finalResponse, rootCause: input.command.rootCause?.trim() || null, normalizedRootCauseId: normalizedRootCause?.id ?? null });
    if (requiresAccountReview) {
      await transaction.ticketAccountReview.upsert({
        where: { ticketId: ticket.id },
        create: {
          ticketId: ticket.id,
          accountManagerUserId: ticket.servicePlan!.accountManagerUserId!,
          status: "PENDING",
          requestedAt: now,
        },
        update: {
          accountManagerUserId: ticket.servicePlan!.accountManagerUserId!,
          status: "PENDING",
          requestedAt: now,
          decidedAt: null,
          decisionNote: null,
        },
      });
      await appendTicketEvent(transaction, { ticketInternalId: ticket.id, ticketPublicId: ticket.ticketId, type: "ticket.status_changed.v1", actorType: "STAFF", sourceType: "HUMAN", visibility: "INTERNAL", fromStatus: ticket.lifecycleStatus, toStatus: "WAITING_INTERNAL", actorUserId, metadata: { source: "ACCOUNT_MANAGER_REVIEW" } });
      await transaction.notification.create({ data: { ticketId: ticket.id, userId: ticket.servicePlan!.accountManagerUserId!, recipientType: "ADMIN", message: `نتیجه تیکت ${ticket.ticketId} منتظر بازبینی مدیر حساب است` } });
      return;
    }
    await markTicketResolved(transaction, ticket.id, now);
    await startTicketResolutionCycle(transaction, ticket.id, now);
    await appendTicketEvent(transaction, { ticketInternalId: ticket.id, ticketPublicId: ticket.ticketId, type: "ticket.resolved.v1", actorType: "STAFF", sourceType: "HUMAN", visibility: "PUBLIC", fromStatus: ticket.lifecycleStatus, toStatus: "RESOLVED", actorUserId, metadata: { resolutionSummary } });
    await transaction.notification.create({ data: { ticketId: ticket.id, recipientType: "USER", message: `تیکت ${ticket.ticketId} حل شد؛ نتیجه را تأیید کنید` } });
  } });
}

function decideWorkspaceAccountReview(input: {
  user: CurrentUser;
  ticketId: string;
  command: DecideAccountReviewInput;
  idempotencyKey: string;
  ifMatch: string | null;
  decision: "APPROVED" | "CHANGES_REQUESTED";
}) {
  return executeCommand({
    ...input,
    route: `${COMMAND_ROUTE_PREFIX}/account-review/${input.decision.toLowerCase()}`,
    permission: SUPPORT_PERMISSIONS.TICKET_READ,
    mutate: async ({ transaction, ticket, actorUserId, now }) => {
      if (
        ticket.accountReview?.status !== "PENDING" ||
        ticket.accountReview.accountManagerUserId !== actorUserId ||
        ticket.lifecycleStatus !== "WAITING_INTERNAL"
      ) {
        throw new TicketCommandError("بازبینی فعال برای این مدیر حساب یافت نشد", "INVALID_TRANSITION", 409);
      }
      const approved = input.decision === "APPROVED";
      const nextStatus = approved ? "RESOLVED" : "IN_PROGRESS";
      await transaction.ticketAccountReview.update({
        where: { ticketId: ticket.id },
        data: { status: input.decision, decidedAt: now, decisionNote: input.command.note },
      });
      await updateTicketVersion(transaction, ticket, { lifecycleStatus: nextStatus });
      if (approved) {
        await markTicketResolved(transaction, ticket.id, now);
        await startTicketResolutionCycle(transaction, ticket.id, now);
        await appendTicketEvent(transaction, { ticketInternalId: ticket.id, ticketPublicId: ticket.ticketId, type: "ticket.resolved.v1", actorType: "STAFF", sourceType: "HUMAN", visibility: "PUBLIC", fromStatus: ticket.lifecycleStatus, toStatus: "RESOLVED", actorUserId, metadata: { resolutionSummary: ticket.resolutionSummary ?? "" } });
        await transaction.notification.create({ data: { ticketId: ticket.id, recipientType: "USER", message: `نتیجه تیکت ${ticket.ticketId} توسط مدیر حساب تأیید شد` } });
      } else {
        await appendTicketEvent(transaction, { ticketInternalId: ticket.id, ticketPublicId: ticket.ticketId, type: "ticket.status_changed.v1", actorType: "STAFF", sourceType: "HUMAN", visibility: "INTERNAL", fromStatus: ticket.lifecycleStatus, toStatus: "IN_PROGRESS", actorUserId, reason: input.command.note, metadata: { source: "ACCOUNT_MANAGER_CHANGES_REQUESTED" } });
      }
    },
  });
}

export function approveWorkspaceAccountReview(input: Omit<Parameters<typeof decideWorkspaceAccountReview>[0], "decision">) {
  return decideWorkspaceAccountReview({ ...input, decision: "APPROVED" });
}

export function requestWorkspaceAccountReviewChanges(input: Omit<Parameters<typeof decideWorkspaceAccountReview>[0], "decision">) {
  return decideWorkspaceAccountReview({ ...input, decision: "CHANGES_REQUESTED" });
}

export function changeWorkspaceTicketPriority(input: { user: CurrentUser; ticketId: string; command: ChangeWorkspaceTicketPriorityInput; idempotencyKey: string; ifMatch: string | null }) {
  return executeCommand({ ...input, route: `${COMMAND_ROUTE_PREFIX}/priority-change`, permission: SUPPORT_PERMISSIONS.TICKET_RESOLVE, mutate: async ({ transaction, ticket, actorUserId }) => {
    await updateTicketVersion(transaction, ticket, { priority: input.command.priority as SupportPriority });
    await appendTicketEvent(transaction, { ticketInternalId: ticket.id, ticketPublicId: ticket.ticketId, type: "ticket.priority_changed.v1", actorType: "STAFF", sourceType: "HUMAN", fromStatus: ticket.lifecycleStatus, toStatus: ticket.lifecycleStatus, actorUserId, reason: input.command.reason, metadata: { fromPriority: ticket.priority, toPriority: input.command.priority, slaSnapshotPreserved: true } });
  } });
}

export function mergeWorkspaceTicket(input: { user: CurrentUser; ticketId: string; command: MergeWorkspaceTicketInput; idempotencyKey: string; ifMatch: string | null }) {
  return executeCommand({
    ...input,
    route: `${COMMAND_ROUTE_PREFIX}/merge`,
    permission: SUPPORT_PERMISSIONS.TICKET_RESOLVE,
    mutate: async ({ transaction, ticket, access, actorUserId, actorName, now }) => {
      if (ticket.ticketId === input.command.targetTicketId) {
        throw new TicketCommandError("تیکت را نمی‌توان با خودش ادغام کرد", "BUSINESS_RULE_VIOLATION", 422);
      }
      if (ticket.mergedIntoTicketId || ["RESOLVED", "CLOSED", "CLOSED_LEGACY"].includes(ticket.lifecycleStatus!)) {
        throw new TicketCommandError("این تیکت در وضعیت قابل ادغام نیست", "INVALID_TRANSITION", 409);
      }
      const target = await transaction.ticket.findFirst({
        where: {
          ticketId: input.command.targetTicketId,
          ...ticketScopeWhere(access),
        },
        select: {
          id: true,
          ticketId: true,
          subject: true,
          partyId: true,
          organizationId: true,
          supportTeamId: true,
          lifecycleStatus: true,
          mergedIntoTicketId: true,
        },
      });
      if (!target || !hasPermission(access, SUPPORT_PERMISSIONS.TICKET_RESOLVE, target.supportTeamId)) {
        throw notFoundError("تیکت مقصد یافت نشد");
      }
      if (target.mergedIntoTicketId || ["CLOSED", "CLOSED_LEGACY"].includes(target.lifecycleStatus ?? "")) {
        throw new TicketCommandError("تیکت مقصد بسته یا قبلاً ادغام شده است", "BUSINESS_RULE_VIOLATION", 422);
      }
      if (!ticket.partyId || ticket.partyId !== target.partyId || ticket.organizationId !== target.organizationId) {
        throw new TicketCommandError("فقط تیکت‌های متعلق به یک مشتری و یک فضای سازمانی قابل ادغام هستند", "BUSINESS_RULE_VIOLATION", 422);
      }

      const finalResponse = `این درخواست به‌عنوان مورد تکراری با تیکت ${target.ticketId} ادغام شد.`;
      await updateTicketVersion(transaction, ticket, {
        lifecycleStatus: "CLOSED",
        status: "CLOSED",
        mergedIntoTicketId: target.id,
        mergedById: actorUserId,
        mergeReason: input.command.reason,
        mergedAt: now,
        closedAt: now,
        closedBy: actorName,
        closedReason: input.command.reason,
        actionTaken: "ادغام تیکت تکراری",
        finalResponse,
        resolutionSummary: finalResponse,
      });
      await Promise.all([
        transaction.ticketAssignment.updateMany({
          where: { ticketId: ticket.id, endedAt: null },
          data: { endedAt: now, activeKey: null },
        }),
        transaction.ticketWorkItem.updateMany({
          where: { ticketId: ticket.id, status: "OPEN" },
          data: { status: "CANCELLED", completedAt: now, response: "لغو خودکار به علت ادغام تیکت" },
        }),
      ]);
      await excludeTicketSlaAfterLegacyClosure(transaction, ticket.id, now);
      await transaction.ticketMessage.createMany({
        data: [
          {
            ticketId: ticket.id,
            visibility: "INTERNAL",
            authorType: "SYSTEM",
            authorSnapshot: actorName,
            body: `${finalResponse}\nدلیل: ${input.command.reason}`,
          },
          {
            ticketId: target.id,
            visibility: "INTERNAL",
            authorType: "SYSTEM",
            authorSnapshot: actorName,
            body: `تیکت تکراری ${ticket.ticketId} با این تیکت ادغام شد.\nدلیل: ${input.command.reason}`,
          },
        ],
      });
      await appendTicketEvent(transaction, {
        ticketInternalId: ticket.id,
        ticketPublicId: ticket.ticketId,
        type: "ticket.merged.v1",
        actorType: "STAFF",
        sourceType: "HUMAN",
        visibility: "INTERNAL",
        fromStatus: ticket.lifecycleStatus,
        toStatus: "CLOSED",
        actorUserId,
        reason: input.command.reason,
        metadata: { sourceTicketId: ticket.ticketId, targetTicketId: target.ticketId },
      });
      await appendTicketEvent(transaction, {
        ticketInternalId: target.id,
        ticketPublicId: target.ticketId,
        type: "ticket.merged.v1",
        actorType: "STAFF",
        sourceType: "HUMAN",
        visibility: "INTERNAL",
        fromStatus: target.lifecycleStatus,
        toStatus: target.lifecycleStatus,
        actorUserId,
        reason: input.command.reason,
        metadata: { sourceTicketId: ticket.ticketId, targetTicketId: target.ticketId },
      });
      await transaction.notification.create({
        data: {
          ticketId: ticket.id,
          recipientType: "USER",
          message: `تیکت ${ticket.ticketId} با ${target.ticketId} ادغام شد`,
        },
      });
    },
  });
}

export function addWorkspaceCollaborator(input: { user: CurrentUser; ticketId: string; command: AddWorkspaceCollaboratorInput; idempotencyKey: string; ifMatch: string | null }) {
  return executeCommand({ ...input, route: `${COMMAND_ROUTE_PREFIX}/collaborators`, permission: SUPPORT_PERMISSIONS.TICKET_REPLY, mutate: async ({ transaction, ticket, access, actorUserId, now }) => {
    const queue = await transaction.supportQueue.findFirst({ where: { id: input.command.queueId, status: "ACTIVE", team: { status: "ACTIVE" } }, select: { id: true, teamId: true } });
    if (!queue || !hasPermission(access, SUPPORT_PERMISSIONS.TICKET_READ, queue.teamId)) throw notFoundError("صف همکار یافت نشد");
    if (input.command.assignedUserId) {
      const member = await transaction.userRoleAssignment.findFirst({ where: { userId: input.command.assignedUserId, supportTeamId: queue.teamId, status: "ACTIVE", role: { permissions: { some: { permission: { key: SUPPORT_PERMISSIONS.TICKET_READ } } } } }, select: { id: true } });
      if (!member) throw new TicketCommandError("همکار انتخاب‌شده عضو فعال تیم مقصد نیست", "BUSINESS_RULE_VIOLATION", 422);
    }
    const nextStatus = ticket.lifecycleStatus === "IN_PROGRESS" ? "INTERNAL_REFERRAL" : ticket.lifecycleStatus!;
    if (nextStatus !== ticket.lifecycleStatus && !canTransitionTicket(ticket.lifecycleStatus!, nextStatus, "STAFF")) throw new TicketCommandError("همکاری داخلی در وضعیت فعلی مجاز نیست", "INVALID_TRANSITION", 409);
    await updateTicketVersion(transaction, ticket, { lifecycleStatus: nextStatus });
    const workItem = await transaction.ticketWorkItem.create({ data: { ticketId: ticket.id, supportTeamId: queue.teamId, queueId: queue.id, assignedUserId: input.command.assignedUserId, requestedById: actorUserId, request: input.command.request, createdAt: now } });
    await appendTicketEvent(transaction, { ticketInternalId: ticket.id, ticketPublicId: ticket.ticketId, type: "ticket.collaborator_added.v1", actorType: "STAFF", sourceType: "HUMAN", fromStatus: ticket.lifecycleStatus, toStatus: nextStatus, actorUserId, metadata: { workItemId: workItem.id.toString(), supportTeamId: queue.teamId, queueId: queue.id, primaryOwnerPreserved: true } });
  } });
}

async function finishWorkItemStatus(context: CommandContext, workItemId: bigint, status: "COMPLETED" | "CANCELLED", response: string) {
  const item = context.ticket.workItems.find((candidate) => candidate.id === workItemId && candidate.status === "OPEN");
  if (!item) throw notFoundError("درخواست همکاری یافت نشد");
  if (status === "COMPLETED") {
    const globalReply = scopedTeams(context.access, SUPPORT_PERMISSIONS.TICKET_REPLY) === null;
    const canComplete = hasPermission(context.access, SUPPORT_PERMISSIONS.TICKET_REPLY, item.supportTeam.id) && (globalReply || !item.assignedUser || item.assignedUser.id === context.actorUserId);
    if (!canComplete) throw notFoundError("درخواست همکاری یافت نشد");
  } else if (item.requestedBy.id !== context.actorUserId && !hasPermission(context.access, SUPPORT_PERMISSIONS.TICKET_REPLY, context.ticket.supportTeamId)) {
    throw notFoundError("درخواست همکاری یافت نشد");
  }
  const changed = await context.transaction.ticketWorkItem.updateMany({ where: { id: workItemId, ticketId: context.ticket.id, status: "OPEN" }, data: { status, response, completedAt: context.now } });
  if (changed.count !== 1) throw new TicketCommandError("درخواست همکاری هم‌زمان تغییر کرده است", "CONCURRENT_MODIFICATION", 409);
  const otherOpen = await context.transaction.ticketWorkItem.count({ where: { ticketId: context.ticket.id, status: "OPEN", id: { not: workItemId } } });
  const nextStatus = otherOpen === 0 && ["INTERNAL_REFERRAL", "WAITING_INTERNAL"].includes(context.ticket.lifecycleStatus!) ? "IN_PROGRESS" : context.ticket.lifecycleStatus!;
  await updateTicketVersion(context.transaction, context.ticket, { lifecycleStatus: nextStatus });
  await appendTicketEvent(context.transaction, { ticketInternalId: context.ticket.id, ticketPublicId: context.ticket.ticketId, type: status === "COMPLETED" ? "ticket.collaboration_completed.v1" : "ticket.collaboration_cancelled.v1", actorType: "STAFF", sourceType: "HUMAN", fromStatus: context.ticket.lifecycleStatus, toStatus: nextStatus, actorUserId: context.actorUserId, reason: status === "CANCELLED" ? response : null, metadata: { workItemId: workItemId.toString(), supportTeamId: item.supportTeam.id } });
}

export function completeWorkspaceWorkItem(input: { user: CurrentUser; ticketId: string; workItemId: bigint; command: CompleteWorkspaceWorkItemInput; idempotencyKey: string; ifMatch: string | null }) {
  return executeCommand({ ...input, command: { ...input.command, workItemId: input.workItemId.toString() }, route: `${COMMAND_ROUTE_PREFIX}/work-items/complete`, permission: SUPPORT_PERMISSIONS.TICKET_REPLY, allowCollaborator: true, mutate: (context) => finishWorkItemStatus(context, input.workItemId, "COMPLETED", input.command.response) });
}

export function cancelWorkspaceWorkItem(input: { user: CurrentUser; ticketId: string; workItemId: bigint; command: CancelWorkspaceWorkItemInput; idempotencyKey: string; ifMatch: string | null }) {
  return executeCommand({ ...input, command: { ...input.command, workItemId: input.workItemId.toString() }, route: `${COMMAND_ROUTE_PREFIX}/work-items/cancel`, permission: SUPPORT_PERMISSIONS.TICKET_REPLY, mutate: (context) => finishWorkItemStatus(context, input.workItemId, "CANCELLED", input.command.reason) });
}
