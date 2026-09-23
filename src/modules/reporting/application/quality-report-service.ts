import {
  Prisma,
  type ReportingDataQualityStatus,
  type ReportingFcrStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  reportingFactScopeWhere,
  resolveReportingAccessScope,
  type ReportingAccessScope,
} from "@/modules/reporting/application/reporting-authorization";
import { readReportingQueryContext } from "@/modules/reporting/application/reporting-query-context";
import type { ReportingRangeQuery } from "@/modules/reporting/contracts/reporting-kpi-schemas";
import type { ReportingFreshness } from "@/modules/reporting/domain/reporting-freshness";
import { ReportingKpiError } from "@/modules/reporting/domain/reporting-kpi-error";
import {
  decimalRatioRoundHalfUp,
  percentageRoundHalfUp,
} from "@/modules/reporting/domain/reporting-statistics";

const CSAT_MINIMUM_RATINGS = 30;
const CSAT_MINIMUM_PARTICIPATION_PERCENTAGE = 20;
const FCR_WINDOW_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;
const EVENT_EXCLUSION_REASONS = new Set([
  "MISSING_SLA_START_EVENT",
  "MISSING_FIRST_RESPONSE_SLA_STATE",
  "MISSING_RESOLUTION_SLA_STATE",
]);

type MetricUnavailableReason =
  | "ZERO_DENOMINATOR"
  | "PROJECTION_UNAVAILABLE"
  | "CRITICAL_DATA_QUALITY";

type QualityFactRow = {
  ticketId: number;
  dataQualityStatus: ReportingDataQualityStatus;
  exclusionReason: string | null;
  legacyImported: boolean;
  firstHumanPublicResponseAt: Date | null;
  firstResolvedAt: Date | null;
  firstClosedAt: Date | null;
  fcrMaturesAt: Date | null;
  fcrStatus: ReportingFcrStatus;
  reopenedWithinWindow: boolean | null;
  reopenWithinWindowEventCount: number;
  customerReopenWithinWindowCount: number;
  staffReopenWithinWindowCount: number;
  systemReopenWithinWindowCount: number;
  resolutionRejectionCount: number;
  transferCount: number;
  collaborationCount: number;
  hasCustomerReplyAfterFirstResponse: boolean;
  rating: number | null;
  ratedAt: Date | null;
};

const qualityFactSelect = {
  ticketId: true,
  dataQualityStatus: true,
  exclusionReason: true,
  legacyImported: true,
  firstHumanPublicResponseAt: true,
  firstResolvedAt: true,
  firstClosedAt: true,
  fcrMaturesAt: true,
  fcrStatus: true,
  reopenedWithinWindow: true,
  reopenWithinWindowEventCount: true,
  customerReopenWithinWindowCount: true,
  staffReopenWithinWindowCount: true,
  systemReopenWithinWindowCount: true,
  resolutionRejectionCount: true,
  transferCount: true,
  collaborationCount: true,
  hasCustomerReplyAfterFirstResponse: true,
  rating: true,
  ratedAt: true,
} satisfies Prisma.TicketReportingFactSelect;

function isHealthy(row: QualityFactRow): boolean {
  return row.dataQualityStatus === "HEALTHY" && !row.legacyImported;
}

function metricReason(
  freshness: ReportingFreshness,
  hasCriticalDataQualityIssue: boolean,
  denominator: number
): MetricUnavailableReason | null {
  if (freshness.status === "UNAVAILABLE") return "PROJECTION_UNAVAILABLE";
  if (hasCriticalDataQualityIssue) return "CRITICAL_DATA_QUALITY";
  if (denominator === 0) return "ZERO_DENOMINATOR";
  return null;
}

function hasValidFcrWindow(row: QualityFactRow): boolean {
  return Boolean(
    row.firstClosedAt &&
      row.fcrMaturesAt &&
      row.fcrMaturesAt.getTime() ===
        row.firstClosedAt.getTime() + FCR_WINDOW_MILLISECONDS
  );
}

function buildFcrMetric(
  rows: readonly QualityFactRow[],
  asOf: Date,
  freshness: ReportingFreshness
) {
  let achievedCount = 0;
  let notAchievedCount = 0;
  let pendingCloseCount = 0;
  let pendingWindowCount = 0;
  let excludedCount = 0;
  let criticalCount = 0;

  for (const row of rows) {
    if (!isHealthy(row) || !row.firstHumanPublicResponseAt) {
      excludedCount += 1;
      if (isHealthy(row) && !row.firstHumanPublicResponseAt) criticalCount += 1;
      continue;
    }
    if (!row.firstClosedAt) {
      pendingCloseCount += 1;
      continue;
    }
    if (!hasValidFcrWindow(row)) {
      criticalCount += 1;
      excludedCount += 1;
      continue;
    }
    if (row.fcrMaturesAt && row.fcrMaturesAt > asOf) {
      pendingWindowCount += 1;
      continue;
    }

    const failed =
      row.hasCustomerReplyAfterFirstResponse ||
      row.transferCount > 0 ||
      row.collaborationCount > 0 ||
      row.resolutionRejectionCount > 0 ||
      row.reopenedWithinWindow === true;
    if (failed) notAchievedCount += 1;
    else achievedCount += 1;
  }

  const denominator = achievedCount + notAchievedCount;
  const reason = metricReason(freshness, criticalCount > 0, denominator);
  return {
    percentage:
      reason === null
        ? percentageRoundHalfUp(achievedCount, denominator)
        : null,
    reason,
    sampleCount: denominator,
    achievedCount,
    notAchievedCount,
    pendingCloseCount,
    pendingWindowCount,
    excludedCount,
  };
}

function hasValidReopenCounters(row: QualityFactRow): boolean {
  const sourceTotal =
    row.customerReopenWithinWindowCount +
    row.staffReopenWithinWindowCount +
    row.systemReopenWithinWindowCount;
  return (
    row.reopenWithinWindowEventCount === sourceTotal &&
    row.reopenedWithinWindow === (sourceTotal > 0)
  );
}

function buildReopenMetric(
  rows: readonly QualityFactRow[],
  asOf: Date,
  freshness: ReportingFreshness
) {
  let eligibleClosedCount = 0;
  let reopenedTicketCount = 0;
  let reopenEventCount = 0;
  let pendingWindowCount = 0;
  let excludedCount = 0;
  let criticalCount = 0;
  const sources = {
    customer: { uniqueTicketCount: 0, eventCount: 0 },
    staff: { uniqueTicketCount: 0, eventCount: 0 },
    system: { uniqueTicketCount: 0, eventCount: 0 },
  };

  for (const row of rows) {
    if (!isHealthy(row)) {
      excludedCount += 1;
      continue;
    }
    if (!hasValidFcrWindow(row)) {
      excludedCount += 1;
      criticalCount += 1;
      continue;
    }
    if (row.fcrMaturesAt && row.fcrMaturesAt > asOf) {
      pendingWindowCount += 1;
      continue;
    }
    if (!hasValidReopenCounters(row)) {
      excludedCount += 1;
      criticalCount += 1;
      continue;
    }

    eligibleClosedCount += 1;
    if (row.reopenedWithinWindow) reopenedTicketCount += 1;
    reopenEventCount += row.reopenWithinWindowEventCount;
    const sourceValues = [
      [sources.customer, row.customerReopenWithinWindowCount],
      [sources.staff, row.staffReopenWithinWindowCount],
      [sources.system, row.systemReopenWithinWindowCount],
    ] as const;
    for (const [source, count] of sourceValues) {
      source.eventCount += count;
      if (count > 0) source.uniqueTicketCount += 1;
    }
  }

  const reason = metricReason(
    freshness,
    criticalCount > 0,
    eligibleClosedCount
  );
  return {
    percentage:
      reason === null
        ? percentageRoundHalfUp(reopenedTicketCount, eligibleClosedCount)
        : null,
    reason,
    sampleCount: eligibleClosedCount,
    reopenedTicketCount,
    reopenEventCount,
    pendingWindowCount,
    excludedCount,
    sources,
  };
}

function buildCsatMetric(
  rows: readonly QualityFactRow[],
  asOf: Date,
  freshness: ReportingFreshness
) {
  let eligibleClosedCount = 0;
  let provisionalClosedCount = 0;
  let matureClosedCount = 0;
  let excludedCount = 0;
  let criticalCount = 0;
  let ratingTotal = 0;
  const distributionCounts: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  for (const row of rows) {
    if (!isHealthy(row) || !row.firstClosedAt || !hasValidFcrWindow(row)) {
      excludedCount += 1;
      if (isHealthy(row)) criticalCount += 1;
      continue;
    }
    eligibleClosedCount += 1;
    if (row.fcrMaturesAt && row.fcrMaturesAt > asOf) provisionalClosedCount += 1;
    else matureClosedCount += 1;

    if (row.rating === null && row.ratedAt === null) continue;
    if (
      row.rating === null ||
      row.ratedAt === null ||
      row.rating < 1 ||
      row.rating > 5
    ) {
      criticalCount += 1;
      continue;
    }
    if (row.ratedAt > asOf) continue;
    const rating = row.rating as 1 | 2 | 3 | 4 | 5;
    distributionCounts[rating] += 1;
    ratingTotal += rating;
  }

  const ratingCount = Object.values(distributionCounts).reduce(
    (sum, count) => sum + count,
    0
  );
  const participationPercentage = percentageRoundHalfUp(
    ratingCount,
    eligibleClosedCount
  );
  const baseReason = metricReason(
    freshness,
    criticalCount > 0,
    eligibleClosedCount
  );
  const meetsPublicationThreshold =
    ratingCount >= CSAT_MINIMUM_RATINGS &&
    participationPercentage !== null &&
    participationPercentage >= CSAT_MINIMUM_PARTICIPATION_PERCENTAGE;
  const reason = baseReason ??
    (meetsPublicationThreshold ? null : "INSUFFICIENT_SAMPLE" as const);
  const distribution =
    reason === null
      ? ([1, 2, 3, 4, 5] as const).map((rating) => ({
          rating,
          count: distributionCounts[rating],
          percentage: percentageRoundHalfUp(
            distributionCounts[rating],
            ratingCount
          ),
        }))
      : null;

  return {
    score:
      reason === null
        ? decimalRatioRoundHalfUp(ratingTotal, ratingCount)
        : null,
    reason,
    ratingCount,
    eligibleClosedCount,
    participationPercentage:
      freshness.status === "UNAVAILABLE" || criticalCount > 0
        ? null
        : participationPercentage,
    provisionalClosedCount,
    matureClosedCount,
    excludedCount,
    publicationThreshold: {
      minimumRatings: CSAT_MINIMUM_RATINGS,
      minimumParticipationPercentage: CSAT_MINIMUM_PARTICIPATION_PERCENTAGE,
      met: reason === null,
    },
    distribution,
  };
}

function buildDataQuality(
  fcrRows: readonly QualityFactRow[],
  closedRows: readonly QualityFactRow[],
  freshness: ReportingFreshness
) {
  const uniqueRows = new Map<number, QualityFactRow>();
  for (const row of [...fcrRows, ...closedRows]) uniqueRows.set(row.ticketId, row);
  const rows = [...uniqueRows.values()];
  const eligibleCount = rows.filter(isHealthy).length;
  return {
    eligibleCount,
    excludedCount: rows.length - eligibleCount,
    missingEventCount: rows.filter(
      (row) =>
        row.exclusionReason !== null &&
        EVENT_EXCLUSION_REASONS.has(row.exclusionReason)
    ).length,
    missingDimensionCount: rows.filter(
      (row) => row.exclusionReason === "MISSING_REQUIRED_DIMENSIONS"
    ).length,
    legacyCount: rows.filter((row) => row.legacyImported).length,
    projectionLagSeconds: freshness.projectionLagSeconds,
    lastProjectedEventAt: freshness.lastProjectedEventAt,
    cohorts: {
      firstResolved: fcrRows.length,
      firstClosed: closedRows.length,
    },
  };
}

export function buildQualityReport(input: {
  definitionVersion: string;
  asOf: Date;
  range: ReportingRangeQuery;
  scope: ReportingAccessScope;
  freshness: ReportingFreshness;
  fcrRows: readonly QualityFactRow[];
  closedRows: readonly QualityFactRow[];
}) {
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
    dataQuality: buildDataQuality(
      input.fcrRows,
      input.closedRows,
      input.freshness
    ),
    firstContactResolution: buildFcrMetric(
      input.fcrRows,
      input.asOf,
      input.freshness
    ),
    reopenRate: buildReopenMetric(
      input.closedRows,
      input.asOf,
      input.freshness
    ),
    customerSatisfaction: buildCsatMetric(
      input.closedRows,
      input.asOf,
      input.freshness
    ),
  };
}

async function readQualityReport(
  transaction: Prisma.TransactionClient,
  input: {
    range: ReportingRangeQuery;
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
  const [fcrRows, closedRows] = await Promise.all([
    transaction.ticketReportingFact.findMany({
      where: { ...commonWhere, firstResolvedAt: range },
      select: qualityFactSelect,
    }),
    transaction.ticketReportingFact.findMany({
      where: { ...commonWhere, firstClosedAt: range },
      select: qualityFactSelect,
    }),
  ]);

  return buildQualityReport({
    definitionVersion: context.definitionVersion,
    asOf: input.asOf,
    range: input.range,
    scope: input.scope,
    freshness: context.freshness,
    fcrRows,
    closedRows,
  });
}

export async function getQualityReport(input: {
  actorUserId: number;
  range: ReportingRangeQuery;
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
      readQualityReport(transaction, {
        range: input.range,
        scope,
        asOf,
      }),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
}
