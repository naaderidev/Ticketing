import { randomUUID } from "node:crypto";
import type { Prisma, SupportPriority } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runSerializableTransaction } from "@/lib/database-transaction";
import { isOutboxDispatchEnabled } from "@/lib/feature-flags";
import { getSlaRoutingConfig } from "@/lib/sla-routing-config";
import { appendTicketEvent } from "@/modules/tickets/application/ticket-event-outbox";
import {
  SLA_EVENT_TYPES,
  TICKET_EVENT_TYPES,
  canonicalizeTicketDomainEventType,
  type TicketDomainEventType,
  type TicketEventActorType,
  type TicketEventSourceType,
} from "@/modules/tickets/contracts/ticket-domain-events";
import {
  backfillMissingTicketSlas,
  markTicketFirstResponse,
  markTicketResolved,
  pauseTicketResolutionSla,
  resumeTicketResolutionSla,
} from "@/modules/sla-routing/application/sla-service";

const SLA_CONSUMER = "SLA_ROUTING_V1";
const SLA_TRIGGER_EVENT_TYPES = new Set<TicketDomainEventType>([
  TICKET_EVENT_TYPES.PUBLIC_MESSAGE_ADDED,
  TICKET_EVENT_TYPES.CUSTOMER_INPUT_REQUESTED,
  TICKET_EVENT_TYPES.CUSTOMER_REPLIED,
  TICKET_EVENT_TYPES.RESOLVED,
]);

function boundedBatchSize(value: number, configuredLimit: number) {
  return Math.min(Math.max(Math.trunc(value), 1), configuredLimit, 500);
}

function retryDelayMilliseconds(attempt: number): number {
  const cappedAttempt = Math.min(Math.max(attempt, 1), 8);
  return 5_000 * 2 ** (cappedAttempt - 1);
}

function safeErrorSummary(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  return `SLA outbox handler failed (${name})`.slice(0, 500);
}

async function seedOutboxDeliveries(limit: number) {
  const events = await prisma.outboxEvent.findMany({
    where: { deliveries: { none: { consumer: SLA_CONSUMER } } },
    orderBy: { id: "asc" },
    take: limit,
    select: { id: true, availableAt: true },
  });
  if (events.length === 0) return 0;
  const result = await prisma.outboxDelivery.createMany({
    data: events.map((event) => ({
      outboxEventId: event.id,
      consumer: SLA_CONSUMER,
      availableAt: event.availableAt,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

async function applySlaProjection(event: {
  aggregateId: string;
  eventType: string;
  occurredAt: Date;
  ticketEvent: {
    actorType: TicketEventActorType;
    sourceType: TicketEventSourceType;
  } | null;
}) {
  const eventType = canonicalizeTicketDomainEventType(event.eventType);
  if (
    !eventType ||
    !SLA_TRIGGER_EVENT_TYPES.has(eventType)
  ) {
    return;
  }
  await runSerializableTransaction(async (transaction) => {
    const ticket = await transaction.ticket.findUnique({
      where: { ticketId: event.aggregateId },
      select: { id: true, ticketId: true },
    });
    if (!ticket) return;
    if (eventType === TICKET_EVENT_TYPES.PUBLIC_MESSAGE_ADDED) {
      if (event.ticketEvent?.actorType === "STAFF" && event.ticketEvent.sourceType === "HUMAN") {
        await markTicketFirstResponse(transaction, ticket.id, event.occurredAt);
      }
    } else if (eventType === TICKET_EVENT_TYPES.CUSTOMER_INPUT_REQUESTED) {
      await pauseTicketResolutionSla(transaction, {
        ticketId: ticket.id,
        ticketPublicId: ticket.ticketId,
        occurredAt: event.occurredAt,
        actorType: "SYSTEM",
        sourceType: "AUTOMATION",
      });
    } else if (eventType === TICKET_EVENT_TYPES.CUSTOMER_REPLIED) {
      await resumeTicketResolutionSla(transaction, {
        ticketId: ticket.id,
        ticketPublicId: ticket.ticketId,
        occurredAt: event.occurredAt,
        actorType: "SYSTEM",
        sourceType: "AUTOMATION",
      });
    } else {
      await markTicketResolved(transaction, ticket.id, event.occurredAt);
    }
  });
}

async function claimOutboxDeliveries(limit: number, now: Date, lockSeconds: number) {
  const staleBefore = new Date(now.getTime() - lockSeconds * 1000);
  const candidates = await prisma.outboxDelivery.findMany({
    where: {
      consumer: SLA_CONSUMER,
      status: { in: ["PENDING", "RETRY", "PROCESSING"] },
      availableAt: { lte: now },
      OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
    },
    orderBy: { id: "asc" },
    take: limit,
    select: {
      id: true,
      attemptCount: true,
      outboxEvent: { select: { id: true, aggregateId: true } },
    },
  });
  const claimed: Array<{ id: bigint; attemptCount: number; lockToken: string }> = [];
  for (const candidate of candidates) {
    const earlierUndelivered = await prisma.outboxDelivery.count({
      where: {
        consumer: SLA_CONSUMER,
        status: { not: "SUCCEEDED" },
        outboxEvent: {
          aggregateId: candidate.outboxEvent.aggregateId,
          id: { lt: candidate.outboxEvent.id },
        },
      },
    });
    if (earlierUndelivered > 0) continue;
    const lockToken = randomUUID();
    const result = await prisma.outboxDelivery.updateMany({
      where: {
        id: candidate.id,
        consumer: SLA_CONSUMER,
        status: { in: ["PENDING", "RETRY", "PROCESSING"] },
        availableAt: { lte: now },
        OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
      },
      data: {
        status: "PROCESSING",
        lockedAt: now,
        lockToken,
        attemptCount: { increment: 1 },
      },
    });
    if (result.count === 1) {
      claimed.push({
        id: candidate.id,
        attemptCount: candidate.attemptCount + 1,
        lockToken,
      });
    }
  }
  return claimed;
}

export async function processSlaOutbox(limit = 100) {
  const config = getSlaRoutingConfig();
  const batchSize = boundedBatchSize(limit, config.batchSize);
  const seeded = await seedOutboxDeliveries(batchSize);
  if (!isOutboxDispatchEnabled()) {
    return { enabled: false, seeded, processed: 0, retried: 0, deadLettered: 0 };
  }

  const now = new Date();
  const claimed = await claimOutboxDeliveries(batchSize, now, config.lockSeconds);
  let processed = 0;
  let retried = 0;
  let deadLettered = 0;
  for (const claim of claimed) {
    const delivery = await prisma.outboxDelivery.findFirst({
      where: { id: claim.id, lockToken: claim.lockToken, status: "PROCESSING" },
      include: {
        outboxEvent: {
          select: {
            id: true,
            aggregateId: true,
            eventType: true,
            occurredAt: true,
            ticketEvent: { select: { actorType: true, sourceType: true } },
          },
        },
      },
    });
    if (!delivery) continue;
    try {
      await applySlaProjection(delivery.outboxEvent);
      const completed = await runSerializableTransaction(async (transaction) => {
        const result = await transaction.outboxDelivery.updateMany({
          where: {
            id: delivery.id,
            lockToken: claim.lockToken,
            status: "PROCESSING",
          },
          data: {
            status: "SUCCEEDED",
            processedAt: new Date(),
            lockedAt: null,
            lockToken: null,
            lastError: null,
          },
        });
        if (result.count === 1) {
          await transaction.outboxEvent.update({
            where: { id: delivery.outboxEvent.id },
            data: { publishedAt: new Date(), lockedAt: null, lastError: null },
          });
        }
        return result;
      });
      if (completed.count === 1) {
        processed += 1;
      }
    } catch (error) {
      const deadLetter = claim.attemptCount >= config.outboxMaxAttempts;
      await runSerializableTransaction(async (transaction) => {
        const failed = await transaction.outboxDelivery.updateMany({
          where: {
            id: delivery.id,
            lockToken: claim.lockToken,
            status: "PROCESSING",
          },
          data: {
            status: deadLetter ? "DEAD_LETTER" : "RETRY",
            availableAt: new Date(
              Date.now() + retryDelayMilliseconds(claim.attemptCount)
            ),
            lockedAt: null,
            lockToken: null,
            lastError: safeErrorSummary(error),
          },
        });
        if (failed.count === 1) {
          await transaction.outboxEvent.update({
            where: { id: delivery.outboxEvent.id },
            data: {
              attemptCount: { increment: 1 },
              lockedAt: null,
              lastError: safeErrorSummary(error),
            },
          });
        }
      });
      if (deadLetter) deadLettered += 1;
      else retried += 1;
    }
  }
  return { enabled: true, seeded, processed, retried, deadLettered };
}

async function escalationRecipients(
  transaction: Prisma.TransactionClient,
  input: { ownerUserId: number | null; supportTeamId: number; level: string }
) {
  if (input.level === "OWNER") {
    return input.ownerUserId ? [input.ownerUserId] : [];
  }
  const roleKeys =
    input.level === "MANAGER" ? ["SUPPORT_MANAGER"] : ["SUPERVISOR"];
  const assignments = await transaction.userRoleAssignment.findMany({
    where: {
      status: "ACTIVE",
      role: { key: { in: roleKeys } },
      ...(input.level === "MANAGER"
        ? { scopeType: "GLOBAL" }
        : { supportTeamId: input.supportTeamId }),
    },
    select: { userId: true },
  });
  const recipients = assignments.map((assignment) => assignment.userId);
  if (input.level === "OWNER_SUPERVISOR" && input.ownerUserId) {
    recipients.push(input.ownerUserId);
  }
  return [...new Set(recipients)];
}

function promotedPriority(priority: SupportPriority): SupportPriority {
  return {
    LOW: "NORMAL",
    NORMAL: "HIGH",
    HIGH: "CRITICAL",
    CRITICAL: "CRITICAL",
  }[priority] as SupportPriority;
}

async function applyManagerEscalation(
  transaction: Prisma.TransactionClient,
  input: {
    ticket: {
      id: number;
      ticketId: string;
      ownerUserId: number | null;
      supportTeamId: number;
      queueId: number;
      priority: SupportPriority;
    };
    occurredAt: Date;
  }
) {
  const nextPriority = promotedPriority(input.ticket.priority);
  const supervisor = await transaction.userRoleAssignment.findFirst({
    where: {
      supportTeamId: input.ticket.supportTeamId,
      status: "ACTIVE",
      validFrom: { lte: input.occurredAt },
      OR: [{ validTo: null }, { validTo: { gt: input.occurredAt } }],
      role: { key: "SUPERVISOR" },
    },
    orderBy: [{ validFrom: "asc" }, { id: "asc" }],
    select: { userId: true },
  });
  const nextOwnerUserId = supervisor?.userId ?? input.ticket.ownerUserId;
  const priorityChanged = nextPriority !== input.ticket.priority;
  const ownerChanged =
    nextOwnerUserId !== null && nextOwnerUserId !== input.ticket.ownerUserId;

  if (!priorityChanged && !ownerChanged) {
    return { nextPriority, nextOwnerUserId };
  }

  await transaction.ticket.update({
    where: { id: input.ticket.id },
    data: {
      priority: nextPriority,
      ownerUserId: nextOwnerUserId,
      version: { increment: 1 },
    },
  });

  if (ownerChanged) {
    await transaction.ticketAssignment.updateMany({
      where: { ticketId: input.ticket.id, endedAt: null },
      data: { endedAt: input.occurredAt, activeKey: null },
    });
    await transaction.ticketAssignment.create({
      data: {
        ticketId: input.ticket.id,
        supportTeamId: input.ticket.supportTeamId,
        queueId: input.ticket.queueId,
        ownerUserId: nextOwnerUserId,
        assignedById: null,
        reason: "تشدید خودکار SLA پس از عبور از ۱۲۵٪ مهلت حل",
        activeKey: String(input.ticket.id),
        startedAt: input.occurredAt,
      },
    });
  }

  if (priorityChanged) {
    await appendTicketEvent(transaction, {
      ticketInternalId: input.ticket.id,
      ticketPublicId: input.ticket.ticketId,
      type: TICKET_EVENT_TYPES.PRIORITY_CHANGED,
      actorType: "SYSTEM",
      sourceType: "AUTOMATION",
      visibility: "INTERNAL",
      occurredAt: input.occurredAt,
      metadata: {
        fromPriority: input.ticket.priority,
        toPriority: nextPriority,
        slaSnapshotPreserved: true,
      },
    });
  }
  if (ownerChanged) {
    await appendTicketEvent(transaction, {
      ticketInternalId: input.ticket.id,
      ticketPublicId: input.ticket.ticketId,
      type: TICKET_EVENT_TYPES.ASSIGNED,
      actorType: "SYSTEM",
      sourceType: "AUTOMATION",
      visibility: "INTERNAL",
      occurredAt: input.occurredAt,
      metadata: { ownerUserId: nextOwnerUserId },
    });
  }
  return { nextPriority, nextOwnerUserId };
}

async function appendThresholdEvent(
  transaction: Prisma.TransactionClient,
  input: {
    ticket: {
      id: number;
      ticketId: string;
      ownerUserId: number | null;
      supportTeamId: number;
      queueId: number;
      priority: SupportPriority;
    };
    type: TicketDomainEventType;
    target: "FIRST_RESPONSE" | "RESOLUTION";
    level: "OWNER" | "OWNER_SUPERVISOR" | "SUPERVISOR" | "MANAGER";
    percentage: number;
    enforcementMode: "OBSERVE_ONLY" | "ENFORCED";
    occurredAt: Date;
  }
) {
  await appendTicketEvent(transaction, {
    ticketInternalId: input.ticket.id,
    ticketPublicId: input.ticket.ticketId,
    type: input.type,
    actorType: "SYSTEM",
    sourceType: "AUTOMATION",
    visibility: "INTERNAL",
    occurredAt: input.occurredAt,
    metadata: {
      target: input.target,
      thresholdPercent: input.percentage,
      escalationLevel: input.level,
      enforcementMode: input.enforcementMode,
    },
  });
  if (input.enforcementMode !== "ENFORCED") return;
  const recipients = await escalationRecipients(transaction, {
    ownerUserId: input.ticket.ownerUserId,
    supportTeamId: input.ticket.supportTeamId,
    level: input.level,
  });
  for (const userId of recipients) {
    await transaction.notification.create({
      data: {
        ticketId: input.ticket.id,
        userId,
        recipientType: "ADMIN",
        message: `هشدار SLA برای تیکت ${input.ticket.ticketId}`,
      },
    });
  }
}

export async function sweepSlaThresholds(limit = 100, now = new Date()) {
  const config = getSlaRoutingConfig();
  const batchSize = boundedBatchSize(limit, config.batchSize);
  const candidates = await prisma.ticketSla.findMany({
    where: {
      legacyImported: false,
      OR: [
        { firstResponseState: { in: ["PENDING", "BREACHED"] }, firstRespondedAt: null },
        { resolutionState: { in: ["PENDING", "BREACHED"] }, resolvedAt: null, pausedAt: null },
      ],
    },
    orderBy: { id: "asc" },
    take: batchSize,
    select: { id: true },
  });
  let evaluated = 0;
  let eventsCreated = 0;
  for (const candidate of candidates) {
    const created = await runSerializableTransaction(async (transaction) => {
      const sla = await transaction.ticketSla.findUnique({
        where: { id: candidate.id },
        include: {
          ticket: {
            select: {
              id: true,
              ticketId: true,
              ownerUserId: true,
              supportTeamId: true,
              queueId: true,
              priority: true,
            },
          },
        },
      });
      if (
        !sla?.ticket.supportTeamId ||
        !sla.ticket.queueId ||
        !sla.ticket.priority ||
        sla.legacyImported
      ) return 0;
      let emitted = 0;
      const ticket = {
        id: sla.ticket.id,
        ticketId: sla.ticket.ticketId,
        ownerUserId: sla.ticket.ownerUserId,
        supportTeamId: sla.ticket.supportTeamId,
        queueId: sla.ticket.queueId,
        priority: sla.ticket.priority,
      };

      if (!sla.firstRespondedAt) {
        if (sla.firstResponseWarningLevel === "NONE" && now >= sla.firstResponseWarning70At) {
          const changed = await transaction.ticketSla.updateMany({
            where: { id: sla.id, firstResponseWarningLevel: "NONE" },
            data: { firstResponseWarningLevel: "SEVENTY" },
          });
          if (changed.count === 1) {
            await appendThresholdEvent(transaction, {
              ticket,
              type: SLA_EVENT_TYPES.WARNING_REACHED,
              target: "FIRST_RESPONSE",
              level: "OWNER",
              percentage: 70,
              enforcementMode: sla.enforcementMode,
              occurredAt: now,
            });
            emitted += 1;
          }
        }
        if (sla.firstResponseWarningLevel !== "NINETY" && now >= sla.firstResponseWarning90At) {
          const changed = await transaction.ticketSla.updateMany({
            where: {
              id: sla.id,
              firstResponseWarningLevel: { in: ["NONE", "SEVENTY"] },
            },
            data: { firstResponseWarningLevel: "NINETY" },
          });
          if (changed.count === 1) {
            await appendThresholdEvent(transaction, {
              ticket,
              type: SLA_EVENT_TYPES.WARNING_REACHED,
              target: "FIRST_RESPONSE",
              level: "OWNER_SUPERVISOR",
              percentage: 90,
              enforcementMode: sla.enforcementMode,
              occurredAt: now,
            });
            emitted += 1;
          }
        }
        if (sla.firstResponseState === "PENDING" && now >= sla.firstResponseDueAt) {
          const changed = await transaction.ticketSla.updateMany({
            where: { id: sla.id, firstResponseState: "PENDING" },
            data: { firstResponseState: "BREACHED" },
          });
          if (changed.count === 1) {
            await appendThresholdEvent(transaction, {
              ticket,
              type: SLA_EVENT_TYPES.BREACHED,
              target: "FIRST_RESPONSE",
              level: "SUPERVISOR",
              percentage: 100,
              enforcementMode: sla.enforcementMode,
              occurredAt: now,
            });
            emitted += 1;
          }
        }
      }

      if (!sla.resolvedAt && !sla.pausedAt) {
        if (sla.resolutionWarningLevel === "NONE" && now >= sla.resolutionWarning70At) {
          const changed = await transaction.ticketSla.updateMany({
            where: { id: sla.id, resolutionWarningLevel: "NONE" },
            data: {
              resolutionWarningLevel: "SEVENTY",
              resolutionEscalationLevel: "OWNER",
            },
          });
          if (changed.count === 1) {
            await appendThresholdEvent(transaction, {
              ticket,
              type: SLA_EVENT_TYPES.WARNING_REACHED,
              target: "RESOLUTION",
              level: "OWNER",
              percentage: 70,
              enforcementMode: sla.enforcementMode,
              occurredAt: now,
            });
            emitted += 1;
          }
        }
        if (sla.resolutionWarningLevel !== "NINETY" && now >= sla.resolutionWarning90At) {
          const changed = await transaction.ticketSla.updateMany({
            where: {
              id: sla.id,
              resolutionWarningLevel: { in: ["NONE", "SEVENTY"] },
            },
            data: {
              resolutionWarningLevel: "NINETY",
              resolutionEscalationLevel: "OWNER_SUPERVISOR",
            },
          });
          if (changed.count === 1) {
            await appendThresholdEvent(transaction, {
              ticket,
              type: SLA_EVENT_TYPES.WARNING_REACHED,
              target: "RESOLUTION",
              level: "OWNER_SUPERVISOR",
              percentage: 90,
              enforcementMode: sla.enforcementMode,
              occurredAt: now,
            });
            emitted += 1;
          }
        }
        if (sla.resolutionState === "PENDING" && now >= sla.resolutionDueAt) {
          const changed = await transaction.ticketSla.updateMany({
            where: { id: sla.id, resolutionState: "PENDING" },
            data: {
              resolutionState: "BREACHED",
              resolutionEscalationLevel: "SUPERVISOR",
            },
          });
          if (changed.count === 1) {
            await appendThresholdEvent(transaction, {
              ticket,
              type: SLA_EVENT_TYPES.BREACHED,
              target: "RESOLUTION",
              level: "SUPERVISOR",
              percentage: 100,
              enforcementMode: sla.enforcementMode,
              occurredAt: now,
            });
            emitted += 1;
          }
        }
        if (
          sla.resolutionEscalationLevel !== "MANAGER" &&
          now >= sla.resolutionManagerAt
        ) {
          const changed = await transaction.ticketSla.updateMany({
            where: {
              id: sla.id,
              resolutionEscalationLevel: { not: "MANAGER" },
            },
            data: { resolutionEscalationLevel: "MANAGER" },
          });
          if (changed.count === 1) {
            if (sla.enforcementMode === "ENFORCED") {
              await applyManagerEscalation(transaction, {
                ticket,
                occurredAt: now,
              });
            }
            await appendThresholdEvent(transaction, {
              ticket,
              type: SLA_EVENT_TYPES.ESCALATED,
              target: "RESOLUTION",
              level: "MANAGER",
              percentage: 125,
              enforcementMode: sla.enforcementMode,
              occurredAt: now,
            });
            emitted += 1;
          }
        }
      }
      return emitted;
    });
    evaluated += 1;
    eventsCreated += created;
  }
  return { evaluated, eventsCreated };
}

export async function runSlaMaintenance() {
  const config = getSlaRoutingConfig();
  const backfill = await backfillMissingTicketSlas(config.batchSize);
  const thresholds = await sweepSlaThresholds(config.batchSize);
  const outbox = await processSlaOutbox(config.batchSize);
  return { backfill, thresholds, outbox };
}
