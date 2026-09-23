import {
  Prisma,
  type ReportingDataQualityStatus,
  type SlaTargetState,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  reportingFactScopeWhere,
  resolveReportingAccessScope,
  type ReportingAccessScope,
} from "@/modules/reporting/application/reporting-authorization";
import { readReportingQueryContext } from "@/modules/reporting/application/reporting-query-context";
import type { TimeSlaReportQuery } from "@/modules/reporting/contracts/reporting-kpi-schemas";
import { ReportingKpiError } from "@/modules/reporting/domain/reporting-kpi-error";
import type { ReportingFreshness } from "@/modules/reporting/domain/reporting-freshness";
import {
  percentageRoundHalfUp,
  summarizeDurations,
  type DurationStatistics,
} from "@/modules/reporting/domain/reporting-statistics";

const EVENT_EXCLUSION_REASONS = new Set([
  "MISSING_SLA_START_EVENT",
  "MISSING_FIRST_RESPONSE_SLA_STATE",
  "MISSING_RESOLUTION_SLA_STATE",
]);
const TERMINAL_SLA_STATES = new Set<SlaTargetState>(["MET", "BREACHED"]);

type MetricUnavailableReason =
  | "NO_ELIGIBLE_DATA"
  | "ZERO_DENOMINATOR"
  | "PROJECTION_UNAVAILABLE"
  | "CRITICAL_DATA_QUALITY";

type FactRow = {
  dataQualityStatus: ReportingDataQualityStatus;
  exclusionReason: string | null;
  legacyImported: boolean;
  firstHumanPublicResponseAt: Date | null;
  firstResponseEffectiveMilliseconds: bigint | null;
  firstResolvedAt: Date | null;
  resolutionEffectiveMilliseconds: bigint | null;
  firstResponseSlaState: SlaTargetState | null;
  resolutionSlaState: SlaTargetState | null;
};

const factSelect = {
  dataQualityStatus: true,
  exclusionReason: true,
  legacyImported: true,
  firstHumanPublicResponseAt: true,
  firstResponseEffectiveMilliseconds: true,
  firstResolvedAt: true,
  resolutionEffectiveMilliseconds: true,
  firstResponseSlaState: true,
  resolutionSlaState: true,
} satisfies Prisma.TicketReportingFactSelect;

function isHealthy(row: FactRow): boolean {
  return row.dataQualityStatus === "HEALTHY" && !row.legacyImported;
}

function durationMetric(
  values: readonly bigint[],
  freshness: ReportingFreshness,
  hasCriticalDataQualityIssue: boolean
): {
  value: DurationStatistics | null;
  reason: MetricUnavailableReason | null;
  sampleCount: number;
} {
  if (freshness.status === "UNAVAILABLE") {
    return {
      value: null,
      reason: "PROJECTION_UNAVAILABLE",
      sampleCount: values.length,
    };
  }
  if (hasCriticalDataQualityIssue) {
    return {
      value: null,
      reason: "CRITICAL_DATA_QUALITY",
      sampleCount: values.length,
    };
  }
  const value = summarizeDurations(values);
  return {
    value,
    reason: value ? null : "NO_ELIGIBLE_DATA",
    sampleCount: values.length,
  };
}

function slaMetric(rows: readonly FactRow[], target: "FIRST_RESPONSE" | "RESOLUTION", freshness: ReportingFreshness) {
  let metCount = 0;
  let breachedCount = 0;
  let pendingCount = 0;
  let notApplicableCount = 0;
  let excludedCount = 0;
  let invalidStateCount = 0;

  for (const row of rows) {
    if (!isHealthy(row)) {
      excludedCount += 1;
      continue;
    }
    const state =
      target === "FIRST_RESPONSE"
        ? row.firstResponseSlaState
        : row.resolutionSlaState;
    if (state === "MET") metCount += 1;
    else if (state === "BREACHED") breachedCount += 1;
    else if (state === "PENDING" || state === "PAUSED") pendingCount += 1;
    else if (state === "NOT_APPLICABLE") notApplicableCount += 1;
    else invalidStateCount += 1;
  }

  const denominator = metCount + breachedCount;
  const percentage = percentageRoundHalfUp(metCount, denominator);
  const reason: MetricUnavailableReason | null =
    freshness.status === "UNAVAILABLE"
      ? "PROJECTION_UNAVAILABLE"
      : invalidStateCount > 0
        ? "CRITICAL_DATA_QUALITY"
        : percentage === null
          ? "ZERO_DENOMINATOR"
          : null;

  return {
    percentage: reason === null ? percentage : null,
    reason,
    sampleCount: denominator,
    metCount,
    breachedCount,
    pendingCount,
    notApplicableCount,
    excludedCount,
  };
}

function combinedSlaMetric(rows: readonly FactRow[], freshness: ReportingFreshness) {
  let metCount = 0;
  let breachedCount = 0;
  let pendingCount = 0;
  let notApplicableCount = 0;
  let excludedCount = 0;
  let invalidStateCount = 0;

  for (const row of rows) {
    if (!isHealthy(row)) {
      excludedCount += 1;
      continue;
    }
    const first = row.firstResponseSlaState;
    const resolution = row.resolutionSlaState;
    if (first === null || resolution === null) {
      invalidStateCount += 1;
    } else if (first === "NOT_APPLICABLE" || resolution === "NOT_APPLICABLE") {
      notApplicableCount += 1;
    } else if (TERMINAL_SLA_STATES.has(first) && TERMINAL_SLA_STATES.has(resolution)) {
      if (first === "MET" && resolution === "MET") metCount += 1;
      else breachedCount += 1;
    } else {
      pendingCount += 1;
    }
  }

  const denominator = metCount + breachedCount;
  const percentage = percentageRoundHalfUp(metCount, denominator);
  const reason: MetricUnavailableReason | null =
    freshness.status === "UNAVAILABLE"
      ? "PROJECTION_UNAVAILABLE"
      : invalidStateCount > 0
        ? "CRITICAL_DATA_QUALITY"
        : percentage === null
          ? "ZERO_DENOMINATOR"
          : null;

  return {
    percentage: reason === null ? percentage : null,
    reason,
    sampleCount: denominator,
    metCount,
    breachedCount,
    pendingCount,
    notApplicableCount,
    excludedCount,
  };
}

export function buildTimeSlaReport(input: {
  definitionVersion: string;
  asOf: Date;
  range: TimeSlaReportQuery;
  scope: ReportingAccessScope;
  freshness: ReportingFreshness;
  creationRows: readonly FactRow[];
  resolutionRows: readonly FactRow[];
  firstResponseDueRows: readonly FactRow[];
  resolutionDueRows: readonly FactRow[];
}) {
  const responseDurations: bigint[] = [];
  const resolutionDurations: bigint[] = [];
  let responsePendingCount = 0;
  let responseExcludedCount = 0;
  let resolutionExcludedCount = 0;
  let responseCriticalCount = 0;
  let resolutionCriticalCount = 0;

  for (const row of input.creationRows) {
    if (!isHealthy(row)) {
      responseExcludedCount += 1;
    } else if (row.firstHumanPublicResponseAt === null) {
      responsePendingCount += 1;
    } else if (row.firstResponseEffectiveMilliseconds === null) {
      responseCriticalCount += 1;
      responseExcludedCount += 1;
    } else {
      responseDurations.push(row.firstResponseEffectiveMilliseconds);
    }
  }
  for (const row of input.resolutionRows) {
    if (!isHealthy(row) || row.resolutionEffectiveMilliseconds === null) {
      resolutionExcludedCount += 1;
      if (isHealthy(row) && row.resolutionEffectiveMilliseconds === null) {
        resolutionCriticalCount += 1;
      }
    } else {
      resolutionDurations.push(row.resolutionEffectiveMilliseconds);
    }
  }

  const missingEventCount = input.creationRows.filter(
    (row) =>
      (row.exclusionReason !== null && EVENT_EXCLUSION_REASONS.has(row.exclusionReason)) ||
      (isHealthy(row) &&
        row.firstHumanPublicResponseAt !== null &&
        row.firstResponseEffectiveMilliseconds === null)
  ).length;
  const missingDimensionCount = input.creationRows.filter(
    (row) => row.exclusionReason === "MISSING_REQUIRED_DIMENSIONS"
  ).length;
  const legacyCount = input.creationRows.filter((row) => row.legacyImported).length;
  const eligibleCount = input.creationRows.filter(isHealthy).length;

  return {
    definitionVersion: input.definitionVersion,
    asOf: input.asOf.toISOString(),
    timeZone: "Asia/Tehran" as const,
    range: {
      from: input.range.from.toISOString(),
      to: input.range.to.toISOString(),
      boundary: "HALF_OPEN" as const,
    },
    scope: input.scope,
    freshness: input.freshness,
    dataQuality: {
      eligibleCount,
      excludedCount: input.creationRows.length - eligibleCount,
      missingEventCount,
      missingDimensionCount,
      legacyCount,
      projectionLagSeconds: input.freshness.projectionLagSeconds,
      lastProjectedEventAt: input.freshness.lastProjectedEventAt,
    },
    firstResponseTime: {
      ...durationMetric(
        responseDurations,
        input.freshness,
        responseCriticalCount > 0
      ),
      respondedCount: responseDurations.length,
      pendingCount: responsePendingCount,
      excludedCount: responseExcludedCount,
    },
    resolutionTime: {
      ...durationMetric(
        resolutionDurations,
        input.freshness,
        resolutionCriticalCount > 0
      ),
      resolvedCount: resolutionDurations.length,
      excludedCount: resolutionExcludedCount,
    },
    slaCompliance: {
      firstResponse: slaMetric(
        input.firstResponseDueRows,
        "FIRST_RESPONSE",
        input.freshness
      ),
      resolution: slaMetric(
        input.resolutionDueRows,
        "RESOLUTION",
        input.freshness
      ),
      combined: combinedSlaMetric(input.resolutionRows, input.freshness),
    },
  };
}

async function readTimeSlaReport(
  transaction: Prisma.TransactionClient,
  input: {
    range: TimeSlaReportQuery;
    scope: ReportingAccessScope;
    asOf: Date;
  }
) {
  const context = await readReportingQueryContext(transaction, input.asOf);
  const commonWhere: Prisma.TicketReportingFactWhereInput = {
    definitionVersion: context.definitionVersion,
    ...reportingFactScopeWhere(input.scope),
  };
  const range = { gte: input.range.from, lt: input.range.to };
  const [creationRows, resolutionRows, firstResponseDueRows, resolutionDueRows] =
    await Promise.all([
      transaction.ticketReportingFact.findMany({
        where: { ...commonWhere, ticketCreatedAt: range },
        select: factSelect,
      }),
      transaction.ticketReportingFact.findMany({
        where: { ...commonWhere, firstResolvedAt: range },
        select: factSelect,
      }),
      transaction.ticketReportingFact.findMany({
        where: { ...commonWhere, firstResponseDueAt: range },
        select: factSelect,
      }),
      transaction.ticketReportingFact.findMany({
        where: { ...commonWhere, resolutionDueAt: range },
        select: factSelect,
      }),
    ]);

  return buildTimeSlaReport({
    definitionVersion: context.definitionVersion,
    asOf: input.asOf,
    range: input.range,
    scope: input.scope,
    freshness: context.freshness,
    creationRows,
    resolutionRows,
    firstResponseDueRows,
    resolutionDueRows,
  });
}

export async function getTimeSlaReport(input: {
  actorUserId: number;
  range: TimeSlaReportQuery;
  now?: Date;
}) {
  const asOf = input.now ?? new Date();
  const scope = await resolveReportingAccessScope(input.actorUserId, asOf);
  if (!scope) {
    throw new ReportingKpiError(
      "دسترسی به گزارش‌های مدیریتی مجاز نیست",
      "FORBIDDEN",
      403
    );
  }

  return prisma.$transaction(
    (transaction) =>
      readTimeSlaReport(transaction, {
        range: input.range,
        scope,
        asOf,
      }),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
}
