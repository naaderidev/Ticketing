import {
  Prisma,
  type RoutingDecisionSource,
  type SlaEnforcementMode,
  type SupportPriority,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runSerializableTransaction } from "@/lib/database-transaction";
import { isSlaEnforcementEnabled } from "@/lib/feature-flags";
import { appendTicketEvent } from "@/modules/tickets/application/ticket-event-outbox";
import type {
  TicketEventActorType,
  TicketEventSourceType,
} from "@/modules/tickets/contracts/ticket-domain-events";
import {
  addSlaDuration,
  calculateSlaMilestones,
  measureSlaDuration,
  parseWeeklySchedule,
  type SlaCalendarDefinition,
} from "@/modules/sla-routing/domain/sla-clock";

export const slaPolicyInclude = {
  calendar: {
    include: {
      holidays: { select: { localDate: true } },
    },
  },
} satisfies Prisma.SlaPolicyInclude;

export type SlaPolicySnapshotSource = Prisma.SlaPolicyGetPayload<{
  include: typeof slaPolicyInclude;
}>;

function localDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function calendarDefinition(
  policy: SlaPolicySnapshotSource
): SlaCalendarDefinition | null {
  if (policy.clockType === "CALENDAR") return null;
  if (!policy.calendar) {
    throw new Error(`Business SLA policy ${policy.code} has no calendar`);
  }
  return {
    timeZone: policy.calendar.timeZone,
    weeklySchedule: parseWeeklySchedule(policy.calendar.weeklySchedule),
    holidayDateKeys: new Set(
      policy.calendar.holidays.map((holiday) => localDateKey(holiday.localDate))
    ),
  };
}

function enforcementMode(): SlaEnforcementMode {
  return isSlaEnforcementEnabled() ? "ENFORCED" : "OBSERVE_ONLY";
}

function snapshotDates(
  startedAt: Date,
  policy: SlaPolicySnapshotSource,
  targetOverride?: { firstResponseMinutes: number; resolutionMinutes: number }
) {
  const calendar = calendarDefinition(policy);
  const firstResponse = calculateSlaMilestones({
    startedAt,
    targetMinutes: targetOverride?.firstResponseMinutes ?? policy.firstResponseMinutes,
    clockType: policy.clockType,
    calendar,
    percentages: [policy.warning70Percent, policy.warning90Percent, policy.breachPercent],
  });
  const resolution = calculateSlaMilestones({
    startedAt,
    targetMinutes: targetOverride?.resolutionMinutes ?? policy.resolutionMinutes,
    clockType: policy.clockType,
    calendar,
    percentages: [
      policy.warning70Percent,
      policy.warning90Percent,
      policy.breachPercent,
      policy.managerPercent,
    ],
  });
  return { firstResponse, resolution };
}

type CreateTicketSlaSnapshotInput = {
  ticketInternalId: number;
  ticketPublicId: string;
  startedAt: Date;
  legacyImported: boolean;
  policy: SlaPolicySnapshotSource;
  actorUserId?: number | null;
  actorType?: TicketEventActorType;
  sourceType?: TicketEventSourceType;
  deferStartedEvent?: boolean;
  targetOverride?: { firstResponseMinutes: number; resolutionMinutes: number };
};

export async function appendTicketSlaStartedEvent(
  transaction: Prisma.TransactionClient,
  input: CreateTicketSlaSnapshotInput,
  enforcementMode: SlaEnforcementMode
) {
  await appendTicketEvent(transaction, {
    ticketInternalId: input.ticketInternalId,
    ticketPublicId: input.ticketPublicId,
    type: "sla.started.v1",
    visibility: "INTERNAL",
    actorType: input.actorType ?? (input.actorUserId ? "USER" : "SYSTEM"),
    sourceType: input.sourceType ?? (input.actorUserId ? "HUMAN" : "AUTOMATION"),
    actorUserId: input.actorUserId ?? null,
    occurredAt: input.startedAt,
    metadata: {
      policyCode: input.policy.code,
      policyVersion: input.policy.version,
      clockType: input.policy.clockType,
      enforcementMode,
      legacyExcluded: input.legacyImported,
    },
  });
}

export async function createTicketSlaSnapshot(
  transaction: Prisma.TransactionClient,
  input: CreateTicketSlaSnapshotInput
) {
  const dates = snapshotDates(input.startedAt, input.policy, input.targetOverride);
  const excluded = input.legacyImported;
  const sla = await transaction.ticketSla.create({
    data: {
      ticketId: input.ticketInternalId,
      policyId: input.policy.id,
      calendarId: input.policy.calendarId,
      policyCode: input.policy.code,
      policyVersion: input.policy.version,
      calendarCode: input.policy.calendar?.code ?? null,
      calendarVersion: input.policy.calendar?.version ?? null,
      clockType: input.policy.clockType,
      firstResponseMinutes: input.targetOverride?.firstResponseMinutes ?? input.policy.firstResponseMinutes,
      resolutionMinutes: input.targetOverride?.resolutionMinutes ?? input.policy.resolutionMinutes,
      enforcementMode: enforcementMode(),
      firstResponseState: excluded ? "NOT_APPLICABLE" : "PENDING",
      resolutionState: excluded ? "NOT_APPLICABLE" : "PENDING",
      startedAt: input.startedAt,
      resolutionCycleStartedAt: input.startedAt,
      firstResponseWarning70At: dates.firstResponse[0],
      firstResponseWarning90At: dates.firstResponse[1],
      firstResponseDueAt: dates.firstResponse[2],
      resolutionWarning70At: dates.resolution[0],
      resolutionWarning90At: dates.resolution[1],
      resolutionDueAt: dates.resolution[2],
      resolutionManagerAt: dates.resolution[3],
      legacyImported: input.legacyImported,
    },
  });
  if (!input.deferStartedEvent) {
    await appendTicketSlaStartedEvent(transaction, input, sla.enforcementMode);
  }
  return sla;
}

export async function recordRoutingDecision(
  transaction: Prisma.TransactionClient,
  input: {
    ticketId: number;
    routeId?: number | null;
    requestTypeId: number;
    supportTeamId: number;
    queueId: number;
    slaPolicyId?: number | null;
    actorUserId?: number | null;
    source: RoutingDecisionSource;
    routeVersion: number;
    priority: SupportPriority;
    reason?: string | null;
    quarantined?: boolean;
  }
) {
  return transaction.routingDecision.create({
    data: {
      ticketId: input.ticketId,
      routeId: input.routeId ?? null,
      requestTypeId: input.requestTypeId,
      supportTeamId: input.supportTeamId,
      queueId: input.queueId,
      slaPolicyId: input.slaPolicyId ?? null,
      actorUserId: input.actorUserId ?? null,
      source: input.source,
      ruleCode: "CATALOG_ACTIVE_ROUTE",
      ruleVersion: 1,
      routeVersion: input.routeVersion,
      priority: input.priority,
      reason: input.reason ?? null,
      inputSnapshot: {
        requestTypeId: input.requestTypeId,
        quarantined: input.quarantined ?? false,
      },
    },
  });
}

async function loadSlaCalendar(
  transaction: Prisma.TransactionClient,
  ticketId: number
) {
  return transaction.ticketSla.findUnique({
    where: { ticketId },
    include: {
      policy: { include: slaPolicyInclude },
      pauses: {
        where: { endedAt: null },
        take: 1,
        orderBy: { startedAt: "desc" },
      },
    },
  });
}

export async function markTicketFirstResponse(
  transaction: Prisma.TransactionClient,
  ticketId: number,
  respondedAt: Date
) {
  const sla = await transaction.ticketSla.findUnique({ where: { ticketId } });
  if (!sla || sla.firstResponseState === "NOT_APPLICABLE" || sla.firstRespondedAt) {
    return false;
  }
  const state = respondedAt <= sla.firstResponseDueAt ? "MET" : "BREACHED";
  const updated = await transaction.ticketSla.updateMany({
    where: { id: sla.id, firstRespondedAt: null },
    data: { firstRespondedAt: respondedAt, firstResponseState: state },
  });
  return updated.count === 1;
}

export async function markTicketResolved(
  transaction: Prisma.TransactionClient,
  ticketId: number,
  resolvedAt: Date
) {
  const sla = await transaction.ticketSla.findUnique({ where: { ticketId } });
  if (!sla || sla.resolutionState === "NOT_APPLICABLE" || sla.resolvedAt) {
    return false;
  }
  const state = resolvedAt <= sla.resolutionDueAt ? "MET" : "BREACHED";
  const updated = await transaction.ticketSla.updateMany({
    where: { id: sla.id, resolvedAt: null },
    data: { resolvedAt, resolutionState: state, pausedAt: null },
  });
  if (updated.count === 1 && sla.pausedAt) {
    await transaction.ticketSlaPause.updateMany({
      where: { ticketSlaId: sla.id, endedAt: null },
      data: {
        endedAt: resolvedAt,
        durationMilliseconds: BigInt(
          Math.max(0, resolvedAt.getTime() - sla.pausedAt.getTime())
        ),
        activeKey: null,
      },
    });
  }
  return updated.count === 1;
}

export async function excludeTicketSlaAfterLegacyClosure(
  transaction: Prisma.TransactionClient,
  ticketId: number,
  occurredAt: Date
) {
  const sla = await transaction.ticketSla.findUnique({ where: { ticketId } });
  if (!sla) return false;
  await transaction.ticketSlaPause.updateMany({
    where: { ticketSlaId: sla.id, endedAt: null },
    data: {
      endedAt: occurredAt,
      durationMilliseconds: sla.pausedAt
        ? BigInt(Math.max(0, occurredAt.getTime() - sla.pausedAt.getTime()))
        : BigInt(0),
      activeKey: null,
    },
  });
  const updated = await transaction.ticketSla.updateMany({
    where: { id: sla.id },
    data: {
      firstResponseState:
        sla.firstRespondedAt === null ? "NOT_APPLICABLE" : sla.firstResponseState,
      resolutionState: "NOT_APPLICABLE",
      resolvedAt: occurredAt,
      pausedAt: null,
    },
  });
  return updated.count === 1;
}

export async function pauseTicketResolutionSla(
  transaction: Prisma.TransactionClient,
  input: {
    ticketId: number;
    ticketPublicId: string;
    occurredAt: Date;
    actorUserId?: number | null;
    actorType?: TicketEventActorType;
    sourceType?: TicketEventSourceType;
  }
) {
  const sla = await loadSlaCalendar(transaction, input.ticketId);
  if (
    !sla ||
    sla.legacyImported ||
    sla.resolvedAt ||
    sla.pausedAt ||
    sla.resolutionState === "NOT_APPLICABLE"
  ) {
    return false;
  }
  const updated = await transaction.ticketSla.updateMany({
    where: { id: sla.id, pausedAt: null, resolvedAt: null },
    data: { pausedAt: input.occurredAt, resolutionState: "PAUSED" },
  });
  if (updated.count !== 1) return false;
  await transaction.ticketSlaPause.create({
    data: {
      ticketSlaId: sla.id,
      reason: "WAITING_USER",
      startedAt: input.occurredAt,
      activeKey: String(sla.id),
    },
  });
  await appendTicketEvent(transaction, {
    ticketInternalId: input.ticketId,
    ticketPublicId: input.ticketPublicId,
    type: "sla.paused.v1",
    visibility: "INTERNAL",
    actorType: input.actorType ?? (input.actorUserId ? "USER" : "SYSTEM"),
    sourceType: input.sourceType ?? (input.actorUserId ? "HUMAN" : "AUTOMATION"),
    actorUserId: input.actorUserId ?? null,
    occurredAt: input.occurredAt,
    metadata: { reason: "WAITING_USER" },
  });
  return true;
}

export async function resumeTicketResolutionSla(
  transaction: Prisma.TransactionClient,
  input: {
    ticketId: number;
    ticketPublicId: string;
    occurredAt: Date;
    actorUserId?: number | null;
    actorType?: TicketEventActorType;
    sourceType?: TicketEventSourceType;
  }
) {
  const sla = await loadSlaCalendar(transaction, input.ticketId);
  const activePause = sla?.pauses[0];
  if (!sla || !sla.pausedAt || !activePause || sla.legacyImported || sla.resolvedAt) {
    return false;
  }
  const calendar = calendarDefinition(sla.policy);
  const effectivePause = measureSlaDuration(
    sla.pausedAt,
    input.occurredAt,
    sla.clockType,
    calendar
  );
  const shift = (date: Date) =>
    addSlaDuration(date, effectivePause, sla.clockType, calendar);
  const wallDuration = Math.max(0, input.occurredAt.getTime() - sla.pausedAt.getTime());
  const newDueAt = shift(sla.resolutionDueAt);
  const updated = await transaction.ticketSla.updateMany({
    where: { id: sla.id, pausedAt: sla.pausedAt },
    data: {
      pausedAt: null,
      resolutionState: input.occurredAt > newDueAt ? "BREACHED" : "PENDING",
      resolutionWarning70At: shift(sla.resolutionWarning70At),
      resolutionWarning90At: shift(sla.resolutionWarning90At),
      resolutionDueAt: newDueAt,
      resolutionManagerAt: shift(sla.resolutionManagerAt),
      totalPausedMilliseconds: { increment: BigInt(wallDuration) },
    },
  });
  if (updated.count !== 1) return false;
  await transaction.ticketSlaPause.update({
    where: { id: activePause.id },
    data: {
      endedAt: input.occurredAt,
      durationMilliseconds: BigInt(wallDuration),
      activeKey: null,
    },
  });
  await appendTicketEvent(transaction, {
    ticketInternalId: input.ticketId,
    ticketPublicId: input.ticketPublicId,
    type: "sla.resumed.v1",
    visibility: "INTERNAL",
    actorType: input.actorType ?? (input.actorUserId ? "USER" : "SYSTEM"),
    sourceType: input.sourceType ?? (input.actorUserId ? "HUMAN" : "AUTOMATION"),
    actorUserId: input.actorUserId ?? null,
    occurredAt: input.occurredAt,
    metadata: { reason: "WAITING_USER", effectivePauseMilliseconds: effectivePause },
  });
  return true;
}

export async function restartTicketResolutionSla(
  transaction: Prisma.TransactionClient,
  input: {
    ticketId: number;
    ticketPublicId: string;
    occurredAt: Date;
    actorUserId?: number | null;
    reason: "TICKET_REOPENED" | "RESOLUTION_REJECTED";
  }
) {
  const sla = await loadSlaCalendar(transaction, input.ticketId);
  if (!sla || sla.legacyImported || sla.resolutionState === "NOT_APPLICABLE") {
    return false;
  }

  const milestones = calculateSlaMilestones({
    startedAt: input.occurredAt,
    targetMinutes: sla.resolutionMinutes,
    clockType: sla.clockType,
    calendar: calendarDefinition(sla.policy),
    percentages: [
      sla.policy.warning70Percent,
      sla.policy.warning90Percent,
      sla.policy.breachPercent,
      sla.policy.managerPercent,
    ],
  });
  const nextCycleNumber = sla.resolutionCycleNumber + 1;

  const updated = await transaction.ticketSla.updateMany({
    where: {
      id: sla.id,
      resolutionCycleNumber: sla.resolutionCycleNumber,
    },
    data: {
      resolutionCycleNumber: nextCycleNumber,
      resolutionCycleStartedAt: input.occurredAt,
      resolutionState: "PENDING",
      resolutionWarningLevel: "NONE",
      resolutionEscalationLevel: "NONE",
      resolutionWarning70At: milestones[0],
      resolutionWarning90At: milestones[1],
      resolutionDueAt: milestones[2],
      resolutionManagerAt: milestones[3],
      resolvedAt: null,
      pausedAt: null,
      totalPausedMilliseconds: BigInt(0),
    },
  });
  if (updated.count !== 1) return false;

  await transaction.ticketSlaPause.updateMany({
    where: { ticketSlaId: sla.id, endedAt: null },
    data: {
      endedAt: input.occurredAt,
      durationMilliseconds: sla.pausedAt
        ? BigInt(Math.max(0, input.occurredAt.getTime() - sla.pausedAt.getTime()))
        : BigInt(0),
      activeKey: null,
    },
  });

  await appendTicketEvent(transaction, {
    ticketInternalId: input.ticketId,
    ticketPublicId: input.ticketPublicId,
    type: "sla.resolution_restarted.v1",
    visibility: "INTERNAL",
    actorType: input.actorUserId ? "USER" : "SYSTEM",
    sourceType: input.actorUserId ? "HUMAN" : "AUTOMATION",
    actorUserId: input.actorUserId ?? null,
    occurredAt: input.occurredAt,
    metadata: { reason: input.reason, cycleNumber: nextCycleNumber },
  });
  return true;
}

export function toPublicSlaDto(sla: {
  policyCode: string;
  policyVersion: number;
  enforcementMode: SlaEnforcementMode;
  firstResponseState: string;
  resolutionState: string;
  firstResponseWarningLevel: string;
  resolutionWarningLevel: string;
  resolutionEscalationLevel: string;
  firstResponseDueAt: Date;
  resolutionDueAt: Date;
  pausedAt: Date | null;
  resolutionCycleNumber: number;
  resolutionCycleStartedAt: Date;
} | null) {
  if (!sla) return null;
  return {
    policy: { code: sla.policyCode, version: sla.policyVersion },
    mode: sla.enforcementMode,
    firstResponse: {
      state: sla.firstResponseState,
      dueAt: sla.firstResponseDueAt.toISOString(),
      warningLevel: sla.firstResponseWarningLevel,
    },
    resolution: {
      state: sla.resolutionState,
      dueAt: sla.resolutionDueAt.toISOString(),
      paused: sla.pausedAt !== null,
      warningLevel: sla.resolutionWarningLevel,
      escalationLevel: sla.resolutionEscalationLevel,
      cycleNumber: sla.resolutionCycleNumber,
      cycleStartedAt: sla.resolutionCycleStartedAt.toISOString(),
    },
  };
}

export async function backfillMissingTicketSlas(limit = 100) {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
  const ticketIds = await prisma.ticket.findMany({
    where: { sla: null, priority: { not: null } },
    orderBy: { id: "asc" },
    take: boundedLimit,
    select: { id: true },
  });
  let created = 0;
  let skipped = 0;
  for (const candidate of ticketIds) {
    try {
      const result = await runSerializableTransaction(async (transaction) => {
        const ticket = await transaction.ticket.findUnique({
          where: { id: candidate.id },
          select: {
            id: true,
            ticketId: true,
            createdAt: true,
            updatedAt: true,
            closedAt: true,
            createdById: true,
            priority: true,
            legacyImported: true,
            lifecycleStatus: true,
            requestTypeId: true,
            routeVersion: true,
            sla: { select: { id: true } },
            messages: {
              where: { visibility: "PUBLIC", authorType: "STAFF" },
              orderBy: { createdAt: "asc" },
              take: 1,
              select: { createdAt: true },
            },
          },
        });
        if (
          !ticket?.priority ||
          ticket.sla ||
          !ticket.requestTypeId ||
          !ticket.routeVersion
        ) {
          return false;
        }
        const route = await transaction.supportCatalogRoute.findFirst({
          where: {
            requestTypeId: ticket.requestTypeId,
            version: ticket.routeVersion,
          },
          select: { slaPolicy: { include: slaPolicyInclude } },
        });
        const policy =
          route?.slaPolicy ??
          (await transaction.slaPolicy.findFirst({
            where: {
              priority: ticket.priority,
              status: "ACTIVE",
              effectiveFrom: { lte: ticket.createdAt },
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gt: ticket.createdAt } },
              ],
            },
            orderBy: { version: "desc" },
            include: slaPolicyInclude,
          }));
        if (!policy) return false;
        await createTicketSlaSnapshot(transaction, {
          ticketInternalId: ticket.id,
          ticketPublicId: ticket.ticketId,
          startedAt: ticket.createdAt,
          legacyImported: ticket.legacyImported,
          policy,
          actorUserId: ticket.createdById,
          actorType: "SYSTEM",
          sourceType: "MIGRATION",
        });
        const firstResponse = ticket.messages[0]?.createdAt;
        if (firstResponse) {
          await markTicketFirstResponse(transaction, ticket.id, firstResponse);
        }
        if (
          !ticket.legacyImported &&
          ["RESOLVED", "CLOSED"].includes(ticket.lifecycleStatus ?? "")
        ) {
          await markTicketResolved(
            transaction,
            ticket.id,
            ticket.closedAt ?? ticket.updatedAt
          );
        }
        return true;
      });
      if (result) created += 1;
      else skipped += 1;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }
  return { created, skipped };
}
