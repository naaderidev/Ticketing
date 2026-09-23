import { Prisma, type ReportingProjectionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { REPORTING_PROJECTION_CONSUMER } from "@/modules/reporting/application/reporting-projection-service";

export type ReportingReconciliationCheck = {
  code: string;
  status: "PASS" | "WARN" | "FAIL";
  actual: number | string | null;
  expected: number | string | null;
};

export type ReportingReconciliationReport = {
  schemaVersion: 1;
  generatedAt: string;
  ready: boolean;
  definitionVersion: string | null;
  sourceHighWatermark: string | null;
  counts: {
    sourceEvents: number;
    processedEvents: number;
    appliedEvents: number;
    ignoredEvents: number;
    ticketFacts: number;
    healthyFacts: number;
    incompleteFacts: number;
    excludedFacts: number;
    supportJourneys: number;
    verifiedTransactionVolumes: number;
    recurringProblemSignals: number;
  };
  checkpoint: {
    status: ReportingProjectionStatus | null;
    definitionVersion: string | null;
    lastOutboxEventId: string | null;
    failureCount: number | null;
    leaseActive: boolean;
  };
  checks: ReportingReconciliationCheck[];
  blockers: string[];
  warnings: string[];
};

type CountRow = { value: bigint | number | string };

function numericCount(value: bigint | number | string | undefined): number {
  const count = Number(value ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Reporting reconciliation count is outside the safe integer range");
  }
  return count;
}

async function rawCount(
  transaction: Prisma.TransactionClient,
  query: Prisma.Sql
): Promise<number> {
  const rows = await transaction.$queryRaw<CountRow[]>(query);
  return numericCount(rows[0]?.value);
}

function addCheck(
  checks: ReportingReconciliationCheck[],
  input: Omit<ReportingReconciliationCheck, "status"> & {
    passed: boolean;
    severity?: "WARN" | "FAIL";
  }
): void {
  checks.push({
    code: input.code,
    status: input.passed ? "PASS" : input.severity ?? "FAIL",
    actual: input.actual,
    expected: input.expected,
  });
}

async function collectReportingReconciliation(
  transaction: Prisma.TransactionClient,
  now: Date
): Promise<ReportingReconciliationReport> {
  const [activeDefinitions, checkpoint, sourceAggregate, processedGroups, factGroups] =
    await Promise.all([
      transaction.kpiDefinitionVersion.findMany({
        where: { status: "ACTIVE" },
        select: { version: true, activeKey: true },
        orderBy: { version: "asc" },
      }),
      transaction.reportingProjectionCheckpoint.findUnique({
        where: { consumerName: REPORTING_PROJECTION_CONSUMER },
        select: {
          status: true,
          definitionVersion: true,
          lastOutboxEventId: true,
          failureCount: true,
          leaseToken: true,
          leaseExpiresAt: true,
        },
      }),
      transaction.outboxEvent.aggregate({
        _count: { _all: true },
        _max: { id: true },
      }),
      transaction.reportingProcessedEvent.groupBy({
        by: ["outcome"],
        _count: { _all: true },
      }),
      transaction.ticketReportingFact.groupBy({
        by: ["dataQualityStatus"],
        _count: { _all: true },
      }),
    ]);

  const definition = activeDefinitions.find(
    (candidate) => candidate.activeKey === "SUPPORT_KPI"
  );
  const sourceEvents = sourceAggregate._count._all;
  const sourceHighWatermark = sourceAggregate._max.id;
  const processedByOutcome = new Map(
    processedGroups.map((group) => [group.outcome, group._count._all])
  );
  const factsByQuality = new Map(
    factGroups.map((group) => [group.dataQualityStatus, group._count._all])
  );
  const processedEvents = [...processedByOutcome.values()].reduce(
    (total, count) => total + count,
    0
  );
  const ticketFacts = [...factsByQuality.values()].reduce(
    (total, count) => total + count,
    0
  );

  const [
    missingProcessedEvents,
    orphanProcessedEvents,
    mismatchedEventIdentities,
    nullProcessedOutboxIds,
    missingAppliedFacts,
    factsWithoutAppliedEvents,
    factsWithWrongDefinition,
    incompleteFactsWithoutReason,
    nativeActiveTicketsWithoutRouting,
    supportJourneys,
    supportJourneysWithWrongDefinition,
    verifiedTransactionVolumes,
    provisionalTransactionVolumes,
    recurringProblemSignals,
    signalsWithWrongDefinition,
  ] = await Promise.all([
    sourceHighWatermark === null
      ? 0
      : rawCount(
          transaction,
          Prisma.sql`
            SELECT COUNT(*) AS value
            FROM OutboxEvent source
            LEFT JOIN ReportingProcessedEvent processed
              ON processed.outboxEventId = source.id
            WHERE source.id <= ${sourceHighWatermark}
              AND processed.eventId IS NULL
          `
        ),
    rawCount(
      transaction,
      Prisma.sql`
        SELECT COUNT(*) AS value
        FROM ReportingProcessedEvent processed
        LEFT JOIN OutboxEvent source ON source.id = processed.outboxEventId
        WHERE processed.outboxEventId IS NOT NULL AND source.id IS NULL
      `
    ),
    rawCount(
      transaction,
      Prisma.sql`
        SELECT COUNT(*) AS value
        FROM ReportingProcessedEvent processed
        INNER JOIN OutboxEvent source ON source.id = processed.outboxEventId
        WHERE processed.eventId <> source.eventId
      `
    ),
    transaction.reportingProcessedEvent.count({ where: { outboxEventId: null } }),
    rawCount(
      transaction,
      Prisma.sql`
        SELECT COUNT(DISTINCT processed.aggregateId) AS value
        FROM ReportingProcessedEvent processed
        INNER JOIN Ticket ticket ON ticket.ticketId = processed.aggregateId
        LEFT JOIN TicketReportingFact fact ON fact.ticketId = ticket.id
        WHERE UPPER(processed.aggregateType) = 'TICKET'
          AND processed.outcome = 'APPLIED'
          AND fact.id IS NULL
      `
    ),
    rawCount(
      transaction,
      Prisma.sql`
        SELECT COUNT(*) AS value
        FROM TicketReportingFact fact
        INNER JOIN Ticket ticket ON ticket.id = fact.ticketId
        LEFT JOIN ReportingProcessedEvent processed
          ON processed.aggregateId = ticket.ticketId
          AND UPPER(processed.aggregateType) = 'TICKET'
          AND processed.outcome = 'APPLIED'
        WHERE processed.eventId IS NULL
      `
    ),
    definition
      ? transaction.ticketReportingFact.count({
          where: { definitionVersion: { not: definition.version } },
        })
      : ticketFacts,
    transaction.ticketReportingFact.count({
      where: { dataQualityStatus: "INCOMPLETE", exclusionReason: null },
    }),
    transaction.ticket.count({
      where: {
        legacyImported: false,
        lifecycleStatus: {
          in: [
            "NEW",
            "UNASSIGNED",
            "IN_PROGRESS",
            "INTERNAL_REFERRAL",
            "WAITING_INTERNAL",
            "WAITING_USER",
            "RESOLVED",
            "REOPENED",
          ],
        },
        OR: [
          { partyId: null },
          { requestTypeId: null },
          { supportTeamId: null },
          { queueId: null },
        ],
      },
    }),
    transaction.supportJourney.count(),
    definition
      ? transaction.supportJourney.count({
          where: { definitionVersion: { not: definition.version } },
        })
      : transaction.supportJourney.count(),
    transaction.transactionVolumeDaily.count({ where: { status: "VERIFIED" } }),
    transaction.transactionVolumeDaily.count({ where: { status: "PROVISIONAL" } }),
    transaction.recurringProblemSignal.count(),
    definition
      ? transaction.recurringProblemSignal.count({
          where: { definitionVersion: { not: definition.version } },
        })
      : transaction.recurringProblemSignal.count(),
  ]);

  const checks: ReportingReconciliationCheck[] = [];
  addCheck(checks, {
    code: "ACTIVE_DEFINITION_UNIQUE",
    passed: activeDefinitions.length === 1 && Boolean(definition),
    actual: activeDefinitions.length,
    expected: 1,
  });
  addCheck(checks, {
    code: "CHECKPOINT_EXISTS",
    passed: checkpoint !== null,
    actual: checkpoint ? 1 : 0,
    expected: 1,
  });
  addCheck(checks, {
    code: "CHECKPOINT_HEALTHY",
    passed: checkpoint?.status === "HEALTHY",
    actual: checkpoint?.status ?? null,
    expected: "HEALTHY",
  });
  addCheck(checks, {
    code: "CHECKPOINT_DEFINITION_MATCH",
    passed:
      Boolean(definition) && checkpoint?.definitionVersion === definition?.version,
    actual: checkpoint?.definitionVersion ?? null,
    expected: definition?.version ?? null,
  });
  addCheck(checks, {
    code: "CHECKPOINT_FAILURES_ZERO",
    passed: checkpoint?.failureCount === 0,
    actual: checkpoint?.failureCount ?? null,
    expected: 0,
  });
  const leaseActive = Boolean(
    checkpoint?.leaseToken &&
      checkpoint.leaseExpiresAt &&
      checkpoint.leaseExpiresAt.getTime() > now.getTime()
  );
  addCheck(checks, {
    code: "NO_ACTIVE_PROJECTION_LEASE",
    passed: !leaseActive,
    actual: leaseActive ? 1 : 0,
    expected: 0,
  });
  addCheck(checks, {
    code: "CHECKPOINT_AT_SOURCE_HIGH_WATERMARK",
    passed: checkpoint?.lastOutboxEventId === sourceHighWatermark,
    actual: checkpoint?.lastOutboxEventId?.toString() ?? null,
    expected: sourceHighWatermark?.toString() ?? null,
  });
  for (const [code, actual] of [
    ["SOURCE_EVENTS_WITHOUT_PROCESSED_RECORD", missingProcessedEvents],
    ["PROCESSED_EVENTS_WITHOUT_SOURCE", orphanProcessedEvents],
    ["SOURCE_PROCESSED_EVENT_ID_MISMATCH", mismatchedEventIdentities],
    ["PROCESSED_EVENTS_WITHOUT_OUTBOX_ID", nullProcessedOutboxIds],
    ["APPLIED_TICKETS_WITHOUT_FACT", missingAppliedFacts],
    ["FACTS_WITHOUT_APPLIED_EVENT", factsWithoutAppliedEvents],
    ["FACTS_WITH_WRONG_DEFINITION", factsWithWrongDefinition],
    ["INCOMPLETE_FACTS_WITHOUT_REASON", incompleteFactsWithoutReason],
    ["ACTIVE_NATIVE_TICKETS_WITHOUT_ROUTING", nativeActiveTicketsWithoutRouting],
    ["SUPPORT_JOURNEYS_WITH_WRONG_DEFINITION", supportJourneysWithWrongDefinition],
    ["RECURRING_SIGNALS_WITH_WRONG_DEFINITION", signalsWithWrongDefinition],
  ] as const) {
    addCheck(checks, { code, passed: actual === 0, actual, expected: 0 });
  }
  addCheck(checks, {
    code: "HEALTHY_FACT_COVERAGE",
    passed: (factsByQuality.get("HEALTHY") ?? 0) > 0,
    actual: factsByQuality.get("HEALTHY") ?? 0,
    expected: ">0 or ticket-based KPIs remain unavailable",
    severity: "WARN",
  });
  addCheck(checks, {
    code: "INCOMPLETE_FACTS_EXCLUDED_FROM_PUBLISHED_KPI",
    passed: (factsByQuality.get("INCOMPLETE") ?? 0) === 0,
    actual: factsByQuality.get("INCOMPLETE") ?? 0,
    expected: 0,
    severity: "WARN",
  });
  addCheck(checks, {
    code: "TRANSACTION_VOLUME_VERIFIED",
    passed: verifiedTransactionVolumes > 0,
    actual: verifiedTransactionVolumes,
    expected: ">0 or KPI remains unavailable",
    severity: "WARN",
  });
  addCheck(checks, {
    code: "TRANSACTION_VOLUME_PROVISIONAL_REVIEW",
    passed: provisionalTransactionVolumes === 0,
    actual: provisionalTransactionVolumes,
    expected: 0,
    severity: "WARN",
  });
  addCheck(checks, {
    code: "SUPPORT_JOURNEY_COVERAGE",
    passed: supportJourneys > 0,
    actual: supportJourneys,
    expected: ">0 or KPI remains unavailable",
    severity: "WARN",
  });

  const blockers = checks
    .filter((check) => check.status === "FAIL")
    .map((check) => check.code);
  const warnings = checks
    .filter((check) => check.status === "WARN")
    .map((check) => check.code);

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    ready: blockers.length === 0,
    definitionVersion: definition?.version ?? null,
    sourceHighWatermark: sourceHighWatermark?.toString() ?? null,
    counts: {
      sourceEvents,
      processedEvents,
      appliedEvents: processedByOutcome.get("APPLIED") ?? 0,
      ignoredEvents: processedByOutcome.get("IGNORED") ?? 0,
      ticketFacts,
      healthyFacts: factsByQuality.get("HEALTHY") ?? 0,
      incompleteFacts: factsByQuality.get("INCOMPLETE") ?? 0,
      excludedFacts: factsByQuality.get("EXCLUDED") ?? 0,
      supportJourneys,
      verifiedTransactionVolumes,
      recurringProblemSignals,
    },
    checkpoint: {
      status: checkpoint?.status ?? null,
      definitionVersion: checkpoint?.definitionVersion ?? null,
      lastOutboxEventId: checkpoint?.lastOutboxEventId?.toString() ?? null,
      failureCount: checkpoint?.failureCount ?? null,
      leaseActive,
    },
    checks,
    blockers,
    warnings,
  };
}

export async function reconcileReportingProjection(
  now = new Date()
): Promise<ReportingReconciliationReport> {
  return prisma.$transaction(
    (transaction) => collectReportingReconciliation(transaction, now),
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 5_000,
      timeout: 30_000,
    }
  );
}
