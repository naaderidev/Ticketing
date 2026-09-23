import { randomUUID } from "node:crypto";
import type {
  Prisma,
  ReportingProjectionStatus,
  TicketReportingFact,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runSerializableTransaction } from "@/lib/database-transaction";
import { getReportingConfig } from "@/lib/reporting-config";
import {
  parseReportingEventEnvelope,
  type ReportingOutboxEvent,
} from "@/modules/reporting/contracts/reporting-event-envelope";
import { ReportingProjectionError } from "@/modules/reporting/domain/reporting-projection-error";
import {
  matureFcrStatus,
  projectTicketReportingFact,
  type TicketFactState,
} from "@/modules/reporting/application/ticket-reporting-fact-projector";
import { canonicalizeTicketDomainEventType } from "@/modules/tickets/contracts/ticket-domain-events";

export const REPORTING_PROJECTION_CONSUMER = "REPORTING_TICKET_FACT_KPI_V1";

type ProjectionLease = {
  token: string;
  definitionVersion: string;
  status: ReportingProjectionStatus;
  lastOutboxEventId: bigint | null;
};

export type ReportingProjectionResult = {
  acquired: boolean;
  processed: number;
  applied: number;
  ignored: number;
  replayed: number;
  matured: number;
  hasMore: boolean;
  status: ReportingProjectionStatus;
  lastOutboxEventId: string | null;
};

export type ReportingBackfillResult = ReportingProjectionResult & {
  mode: "BACKFILL" | "NOOP" | "REBUILD" | "RESUME";
  sourceEvents: number;
};

function wait(milliseconds: number): Promise<void> {
  if (milliseconds === 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function outboxIdRange(
  afterOutboxEventId: bigint | null,
  throughOutboxEventId?: bigint | null
): Prisma.BigIntFilter | undefined {
  const range: Prisma.BigIntFilter = {};
  if (afterOutboxEventId !== null) range.gt = afterOutboxEventId;
  if (throughOutboxEventId !== undefined && throughOutboxEventId !== null) {
    range.lte = throughOutboxEventId;
  }
  return Object.keys(range).length > 0 ? range : undefined;
}

function boundedBatchSize(value: number, configuredLimit: number): number {
  return Math.min(Math.max(Math.trunc(value), 1), configuredLimit, 500);
}

function errorCode(error: unknown): string {
  if (error instanceof ReportingProjectionError) return error.code.slice(0, 100);
  return "UNEXPECTED_PROJECTION_FAILURE";
}

function ticketFactState(fact: TicketReportingFact): TicketFactState {
  return fact;
}

async function activeDefinitionVersion(
  transaction: Prisma.TransactionClient
): Promise<string> {
  const definition = await transaction.kpiDefinitionVersion.findUnique({
    where: { activeKey: "SUPPORT_KPI" },
    select: { version: true, status: true },
  });
  if (!definition || definition.status !== "ACTIVE") {
    throw new ReportingProjectionError(
      "No active KPI definition is registered",
      "ACTIVE_KPI_DEFINITION_MISSING"
    );
  }
  return definition.version;
}

async function acquireProjectionLease(
  leaseSeconds: number,
  now: Date,
  allowDefinitionChange = false
): Promise<ProjectionLease | null> {
  return runSerializableTransaction(async (transaction) => {
    const definitionVersion = await activeDefinitionVersion(transaction);
    const existing = await transaction.reportingProjectionCheckpoint.upsert({
      where: { consumerName: REPORTING_PROJECTION_CONSUMER },
      create: {
        consumerName: REPORTING_PROJECTION_CONSUMER,
        definitionVersion,
      },
      update: {},
      select: {
        definitionVersion: true,
        status: true,
        lastOutboxEventId: true,
      },
    });
    if (
      existing.definitionVersion !== definitionVersion &&
      !allowDefinitionChange
    ) {
      throw new ReportingProjectionError(
        "Reporting definition changed and requires an explicit rebuild",
        "DEFINITION_VERSION_REBUILD_REQUIRED"
      );
    }

    const token = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1_000);
    const acquired = await transaction.reportingProjectionCheckpoint.updateMany({
      where: {
        consumerName: REPORTING_PROJECTION_CONSUMER,
        OR: [
          { leaseToken: null },
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        leaseToken: token,
        leaseExpiresAt,
      },
    });
    if (acquired.count !== 1) return null;
    return {
      token,
      definitionVersion,
      status: existing.status,
      lastOutboxEventId: existing.lastOutboxEventId,
    };
  });
}

async function assertAndRenewLease(
  transaction: Prisma.TransactionClient,
  lease: ProjectionLease,
  leaseSeconds: number,
  now: Date
): Promise<void> {
  const renewed = await transaction.reportingProjectionCheckpoint.updateMany({
    where: {
      consumerName: REPORTING_PROJECTION_CONSUMER,
      leaseToken: lease.token,
      leaseExpiresAt: { gt: now },
    },
    data: {
      leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1_000),
    },
  });
  if (renewed.count !== 1) {
    throw new ReportingProjectionError(
      "Reporting projection lease was lost",
      "PROJECTION_LEASE_LOST"
    );
  }
}

async function recordIgnoredEvent(
  transaction: Prisma.TransactionClient,
  input: {
    event: ReportingOutboxEvent;
    aggregateVersion: number | null;
    definitionVersion: string;
    reasonCode: string;
  }
): Promise<void> {
  await transaction.reportingProcessedEvent.create({
    data: {
      eventId: input.event.eventId,
      outboxEventId: input.event.id,
      aggregateType: input.event.aggregateType,
      aggregateId: input.event.aggregateId,
      aggregateVersion: input.aggregateVersion,
      eventType: input.event.eventType,
      occurredAt: input.event.occurredAt,
      definitionVersion: input.definitionVersion,
      outcome: "IGNORED",
      reasonCode: input.reasonCode,
    },
  });
}

async function advanceCheckpoint(
  transaction: Prisma.TransactionClient,
  lease: ProjectionLease,
  event: ReportingOutboxEvent,
  leaseSeconds: number,
  now: Date
): Promise<void> {
  const advanced = await transaction.reportingProjectionCheckpoint.updateMany({
    where: {
      consumerName: REPORTING_PROJECTION_CONSUMER,
      leaseToken: lease.token,
    },
    data: {
      lastOutboxEventId: event.id,
      lastEventId: event.eventId,
      lastEventOccurredAt: event.occurredAt,
      lastProcessedAt: now,
      leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1_000),
      failureCount: 0,
      lastErrorCode: null,
    },
  });
  if (advanced.count !== 1) {
    throw new ReportingProjectionError(
      "Reporting projection checkpoint could not advance",
      "PROJECTION_LEASE_LOST"
    );
  }
  lease.lastOutboxEventId = event.id;
}

async function projectOneEvent(
  transaction: Prisma.TransactionClient,
  event: ReportingOutboxEvent,
  lease: ProjectionLease
): Promise<"APPLIED" | "IGNORED" | "REPLAYED"> {
  const alreadyProcessed = await transaction.reportingProcessedEvent.findUnique({
      where: { eventId: event.eventId },
      select: { eventId: true },
  });
  if (alreadyProcessed) {
    return "REPLAYED";
  }

  const envelope = parseReportingEventEnvelope(event);
  if (event.aggregateType.toUpperCase() !== "TICKET") {
    await recordIgnoredEvent(transaction, {
      event,
      aggregateVersion: envelope.aggregateVersion,
      definitionVersion: lease.definitionVersion,
      reasonCode: "AGGREGATE_TYPE_UNSUPPORTED",
    });
    return "IGNORED";
  }

  const canonicalEventType = canonicalizeTicketDomainEventType(event.eventType);
  if (!canonicalEventType) {
    await recordIgnoredEvent(transaction, {
      event,
      aggregateVersion: envelope.aggregateVersion,
      definitionVersion: lease.definitionVersion,
      reasonCode: "EVENT_TYPE_UNSUPPORTED",
    });
    return "IGNORED";
  }

  const ticket = await transaction.ticket.findUnique({
    where: { ticketId: event.aggregateId },
    select: { id: true },
  });
  if (!ticket) {
    await recordIgnoredEvent(transaction, {
      event,
      aggregateVersion: envelope.aggregateVersion,
      definitionVersion: lease.definitionVersion,
      reasonCode: "SOURCE_TICKET_RETAINED_DELETED",
    });
    return "IGNORED";
  }

  const current = await transaction.ticketReportingFact.findUnique({
    where: { ticketId: ticket.id },
  });
  const decision = projectTicketReportingFact(
    current ? ticketFactState(current) : null,
    canonicalEventType,
    envelope
  );

  if (decision.values) {
    await transaction.ticketReportingFact.upsert({
      where: { ticketId: ticket.id },
      create: {
        ticketId: ticket.id,
        definitionVersion: lease.definitionVersion,
        ...decision.values,
      },
      update: decision.values,
    });
  }
  await transaction.reportingProcessedEvent.create({
    data: {
      eventId: event.eventId,
      outboxEventId: event.id,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      aggregateVersion: envelope.aggregateVersion,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      definitionVersion: lease.definitionVersion,
      outcome: decision.outcome,
      reasonCode: decision.reasonCode,
    },
  });
  return decision.outcome;
}

function backlogStatus(
  nextEventOccurredAt: Date | null,
  now: Date,
  rebuilding: boolean
): ReportingProjectionStatus {
  if (rebuilding) return "REBUILDING";
  if (!nextEventOccurredAt) return "HEALTHY";
  const lagMilliseconds = Math.max(0, now.getTime() - nextEventOccurredAt.getTime());
  if (lagMilliseconds > 15 * 60 * 1_000) return "UNAVAILABLE";
  if (lagMilliseconds > 5 * 60 * 1_000) return "STALE";
  return "HEALTHY";
}

async function maturePendingFcrFacts(
  transaction: Prisma.TransactionClient,
  lease: ProjectionLease,
  limit: number,
  now: Date
): Promise<number> {
  const candidates = await transaction.ticketReportingFact.findMany({
    where: {
      definitionVersion: lease.definitionVersion,
      fcrStatus: "PENDING_WINDOW",
      fcrMaturesAt: { lte: now },
    },
    orderBy: { id: "asc" },
    take: limit,
  });
  for (const fact of candidates) {
    await transaction.ticketReportingFact.update({
      where: { id: fact.id },
      data: { fcrStatus: matureFcrStatus(ticketFactState(fact)) },
    });
  }
  return candidates.length;
}

async function releaseProjectionLease(
  lease: ProjectionLease,
  input: {
    status: ReportingProjectionStatus;
    now: Date;
    rebuildCompleted: boolean;
  }
): Promise<void> {
  await prisma.reportingProjectionCheckpoint.updateMany({
    where: {
      consumerName: REPORTING_PROJECTION_CONSUMER,
      leaseToken: lease.token,
    },
    data: {
      status: input.status,
      lastProcessedAt: input.now,
      failureCount: 0,
      lastErrorCode: null,
      leaseToken: null,
      leaseExpiresAt: null,
      ...(input.rebuildCompleted
        ? { rebuildCompletedAt: input.now }
        : {}),
    },
  });
}

async function markProjectionFailure(
  lease: ProjectionLease,
  error: unknown
): Promise<void> {
  await prisma.reportingProjectionCheckpoint.updateMany({
    where: {
      consumerName: REPORTING_PROJECTION_CONSUMER,
      leaseToken: lease.token,
    },
    data: {
      status: "FAILED",
      failureCount: { increment: 1 },
      lastErrorCode: errorCode(error),
      leaseToken: null,
      leaseExpiresAt: null,
    },
  });
}

async function processBatchWithLease(
  lease: ProjectionLease,
  batchSize: number,
  leaseSeconds: number,
  rebuilding: boolean,
  throughOutboxEventId?: bigint | null
): Promise<ReportingProjectionResult> {
  const events = await prisma.outboxEvent.findMany({
    where: { id: outboxIdRange(lease.lastOutboxEventId, throughOutboxEventId) },
    orderBy: { id: "asc" },
    take: batchSize,
    select: {
      id: true,
      eventId: true,
      aggregateType: true,
      aggregateId: true,
      eventType: true,
      schemaVersion: true,
      payload: true,
      occurredAt: true,
    },
  });

  const now = new Date();
  const { applied, ignored, replayed, matured } =
    await runSerializableTransaction(async (transaction) => {
      await assertAndRenewLease(transaction, lease, leaseSeconds, now);
      let appliedCount = 0;
      let ignoredCount = 0;
      let replayedCount = 0;
      for (const event of events) {
        const outcome = await projectOneEvent(transaction, event, lease);
        if (outcome === "APPLIED") appliedCount += 1;
        else if (outcome === "IGNORED") ignoredCount += 1;
        else replayedCount += 1;
      }
      const maturedCount = await maturePendingFcrFacts(
        transaction,
        lease,
        batchSize,
        now
      );
      const lastEvent = events.at(-1);
      if (lastEvent) {
        await advanceCheckpoint(
          transaction,
          lease,
          lastEvent,
          leaseSeconds,
          new Date()
        );
      }
      return {
        applied: appliedCount,
        ignored: ignoredCount,
        replayed: replayedCount,
        matured: maturedCount,
      };
    });
  const nextEvent = await prisma.outboxEvent.findFirst({
    where: { id: outboxIdRange(lease.lastOutboxEventId, throughOutboxEventId) },
    orderBy: { id: "asc" },
    select: { occurredAt: true },
  });
  const status = backlogStatus(nextEvent?.occurredAt ?? null, now, rebuilding);

  return {
    acquired: true,
    processed: events.length,
    applied,
    ignored,
    replayed,
    matured,
    hasMore: Boolean(nextEvent),
    status,
    lastOutboxEventId: lease.lastOutboxEventId?.toString() ?? null,
  };
}

async function sourceSnapshot(input: {
  afterOutboxEventId?: bigint | null;
  maximumEvents: number;
}): Promise<{ count: number; highWatermark: bigint | null }> {
  const snapshot = await prisma.outboxEvent.aggregate({
    where: input.afterOutboxEventId
      ? { id: { gt: input.afterOutboxEventId } }
      : undefined,
    _count: { _all: true },
    _max: { id: true },
  });
  if (snapshot._count._all > input.maximumEvents) {
    throw new ReportingProjectionError(
      "Reporting backfill exceeds its configured event limit",
      "REBUILD_EVENT_LIMIT_EXCEEDED"
    );
  }
  return {
    count: snapshot._count._all,
    highWatermark: snapshot._max.id,
  };
}

async function runBackfillFromLease(input: {
  lease: ProjectionLease;
  sourceEvents: number;
  highWatermark: bigint | null;
  mode: ReportingBackfillResult["mode"];
  rebuildCompleted: boolean;
}): Promise<ReportingBackfillResult> {
  const config = getReportingConfig();
  const total: ReportingBackfillResult = {
    acquired: true,
    processed: 0,
    applied: 0,
    ignored: 0,
    replayed: 0,
    matured: 0,
    hasMore: input.sourceEvents > 0,
    status: "REBUILDING",
    lastOutboxEventId: input.lease.lastOutboxEventId?.toString() ?? null,
    mode: input.mode,
    sourceEvents: input.sourceEvents,
  };

  while (total.hasMore) {
    const batch = await processBatchWithLease(
      input.lease,
      config.batchSize,
      config.leaseSeconds,
      true,
      input.highWatermark
    );
    total.processed += batch.processed;
    total.applied += batch.applied;
    total.ignored += batch.ignored;
    total.replayed += batch.replayed;
    total.matured += batch.matured;
    total.hasMore = batch.hasMore;
    total.lastOutboxEventId = batch.lastOutboxEventId;
    if (batch.processed === 0 && batch.hasMore) {
      throw new ReportingProjectionError(
        "Reporting backfill did not make progress",
        "REBUILD_STALLED"
      );
    }
    if (batch.hasMore) await wait(config.rebuildSleepMilliseconds);
  }

  total.status = "HEALTHY";
  await releaseProjectionLease(input.lease, {
    status: "HEALTHY",
    now: new Date(),
    rebuildCompleted: input.rebuildCompleted,
  });
  return total;
}

export async function backfillReportingProjection(): Promise<ReportingBackfillResult> {
  const config = getReportingConfig();
  const existing = await prisma.reportingProjectionCheckpoint.findUnique({
    where: { consumerName: REPORTING_PROJECTION_CONSUMER },
    select: { status: true, lastOutboxEventId: true },
  });
  const snapshot = await sourceSnapshot({
    afterOutboxEventId: existing?.lastOutboxEventId,
    maximumEvents: config.maxRebuildEvents,
  });
  const lease = await acquireProjectionLease(config.leaseSeconds, new Date());
  if (!lease) {
    throw new ReportingProjectionError(
      "Reporting projection is already running",
      "PROJECTION_LEASE_UNAVAILABLE"
    );
  }

  const mode: ReportingBackfillResult["mode"] =
    snapshot.count === 0
      ? "NOOP"
      : existing?.status === "REBUILDING" || existing?.status === "FAILED"
        ? "RESUME"
        : "BACKFILL";
  try {
    if (snapshot.count === 0) {
      await releaseProjectionLease(lease, {
        status: "HEALTHY",
        now: new Date(),
        rebuildCompleted: existing?.status === "REBUILDING",
      });
      return {
        acquired: true,
        processed: 0,
        applied: 0,
        ignored: 0,
        replayed: 0,
        matured: 0,
        hasMore: false,
        status: "HEALTHY",
        lastOutboxEventId: lease.lastOutboxEventId?.toString() ?? null,
        mode,
        sourceEvents: 0,
      };
    }
    await prisma.reportingProjectionCheckpoint.updateMany({
      where: {
        consumerName: REPORTING_PROJECTION_CONSUMER,
        leaseToken: lease.token,
      },
      data: { status: "REBUILDING", lastErrorCode: null },
    });
    lease.status = "REBUILDING";
    return await runBackfillFromLease({
      lease,
      sourceEvents: snapshot.count,
      highWatermark: snapshot.highWatermark,
      mode,
      rebuildCompleted: mode === "RESUME",
    });
  } catch (error) {
    await markProjectionFailure(lease, error);
    throw error;
  }
}

export async function processReportingProjection(
  requestedLimit = 100
): Promise<ReportingProjectionResult> {
  const config = getReportingConfig();
  const batchSize = boundedBatchSize(requestedLimit, config.batchSize);
  const lease = await acquireProjectionLease(config.leaseSeconds, new Date());
  if (!lease) {
    return {
      acquired: false,
      processed: 0,
      applied: 0,
      ignored: 0,
      replayed: 0,
      matured: 0,
      hasMore: true,
      status: "STALE",
      lastOutboxEventId: null,
    };
  }

  try {
    const rebuilding = lease.status === "REBUILDING";
    const result = await processBatchWithLease(
      lease,
      batchSize,
      config.leaseSeconds,
      rebuilding
    );
    await releaseProjectionLease(lease, {
      status: result.status,
      now: new Date(),
      rebuildCompleted: rebuilding && !result.hasMore,
    });
    return result;
  } catch (error) {
    await markProjectionFailure(lease, error);
    throw error;
  }
}

export async function rebuildReportingProjection(): Promise<ReportingBackfillResult> {
  const config = getReportingConfig();
  const snapshot = await sourceSnapshot({
    maximumEvents: config.maxRebuildEvents,
  });
  const lease = await acquireProjectionLease(
    config.leaseSeconds,
    new Date(),
    true
  );
  if (!lease) {
    throw new ReportingProjectionError(
      "Reporting projection is already running",
      "PROJECTION_LEASE_UNAVAILABLE"
    );
  }

  try {
    await runSerializableTransaction(async (transaction) => {
      await assertAndRenewLease(
        transaction,
        lease,
        config.leaseSeconds,
        new Date()
      );
      await transaction.ticketReportingFact.deleteMany();
      await transaction.reportingProcessedEvent.deleteMany();
      await transaction.reportingProjectionCheckpoint.update({
        where: { consumerName: REPORTING_PROJECTION_CONSUMER },
        data: {
          definitionVersion: lease.definitionVersion,
          status: "REBUILDING",
          lastOutboxEventId: null,
          lastEventId: null,
          lastEventOccurredAt: null,
          rebuildStartedAt: new Date(),
          rebuildCompletedAt: null,
          failureCount: 0,
          lastErrorCode: null,
        },
      });
    });
    lease.status = "REBUILDING";
    lease.lastOutboxEventId = null;

    return await runBackfillFromLease({
      lease,
      sourceEvents: snapshot.count,
      highWatermark: snapshot.highWatermark,
      mode: "REBUILD",
      rebuildCompleted: true,
    });
  } catch (error) {
    await markProjectionFailure(lease, error);
    throw error;
  }
}
