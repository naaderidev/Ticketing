import { Prisma, type SupportJourneyStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  resolveReportingAccessScope,
  type ReportingAccessScope,
} from "@/modules/reporting/application/reporting-authorization";
import { readReportingQueryContext } from "@/modules/reporting/application/reporting-query-context";
import type { ReportingRangeQuery } from "@/modules/reporting/contracts/reporting-kpi-schemas";
import type { ReportingFreshness } from "@/modules/reporting/domain/reporting-freshness";
import { ReportingKpiError } from "@/modules/reporting/domain/reporting-kpi-error";
import { percentageRoundHalfUp } from "@/modules/reporting/domain/reporting-statistics";

type AutomatedResolutionUnavailableReason =
  | "ZERO_DENOMINATOR"
  | "CRITICAL_DATA_QUALITY";

export type SupportJourneyReportRow = {
  status: SupportJourneyStatus;
  contentIsPublicApprovedActive: boolean;
  knowledgeArticleVersionId: bigint | null;
  contentShownAt: Date | null;
  confirmedResolvedAt: Date | null;
  conversionDeadlineAt: Date | null;
  humanInterventionAt: Date | null;
  convertedTicketId: number | null;
  outcomeFinalizedAt: Date | null;
  exclusionReason: string | null;
  serviceId: number | null;
  requestTypeId: number | null;
  supportTeamId: number | null;
};

const journeySelect = {
  status: true,
  contentIsPublicApprovedActive: true,
  knowledgeArticleVersionId: true,
  contentShownAt: true,
  confirmedResolvedAt: true,
  conversionDeadlineAt: true,
  humanInterventionAt: true,
  convertedTicketId: true,
  outcomeFinalizedAt: true,
  exclusionReason: true,
  serviceId: true,
  requestTypeId: true,
  supportTeamId: true,
} satisfies Prisma.SupportJourneySelect;

function isEligibleKnowledgeJourney(row: SupportJourneyReportRow): boolean {
  return Boolean(
    row.contentIsPublicApprovedActive &&
      row.knowledgeArticleVersionId &&
      row.contentShownAt &&
      row.status !== "EXCLUDED" &&
      !row.exclusionReason
  );
}

function hasInvalidOutcome(row: SupportJourneyReportRow): boolean {
  if (row.status === "CONFIRMED_RESOLVED") {
    return !row.confirmedResolvedAt || !row.conversionDeadlineAt;
  }
  if (row.status === "CONVERTED_TO_TICKET") {
    return row.convertedTicketId === null;
  }
  return row.outcomeFinalizedAt !== null;
}

export function buildAutomatedResolutionReport(input: {
  definitionVersion: string;
  asOf: Date;
  range: ReportingRangeQuery;
  scope: ReportingAccessScope;
  freshness: ReportingFreshness;
  rows: readonly SupportJourneyReportRow[];
}) {
  let confirmedAutomatedCount = 0;
  let convertedToTicketCount = 0;
  let humanInterventionCount = 0;
  let unknownOutcomeCount = 0;
  let excludedCount = 0;
  let criticalCount = 0;

  const eligibleRows = input.rows.filter((row) => {
    const eligible = isEligibleKnowledgeJourney(row);
    if (!eligible) excludedCount += 1;
    return eligible;
  });

  for (const row of eligibleRows) {
    if (hasInvalidOutcome(row)) {
      criticalCount += 1;
      continue;
    }
    if (row.humanInterventionAt) {
      humanInterventionCount += 1;
      continue;
    }
    if (row.convertedTicketId || row.status === "CONVERTED_TO_TICKET") {
      convertedToTicketCount += 1;
      continue;
    }
    const isFinalizedAutomatedResolution =
      row.status === "CONFIRMED_RESOLVED" &&
      row.outcomeFinalizedAt !== null &&
      row.outcomeFinalizedAt <= input.asOf;
    if (isFinalizedAutomatedResolution) confirmedAutomatedCount += 1;
    else unknownOutcomeCount += 1;
  }

  const sampleCount = eligibleRows.length;
  const reason: AutomatedResolutionUnavailableReason | null =
    criticalCount > 0
      ? "CRITICAL_DATA_QUALITY"
      : sampleCount === 0
        ? "ZERO_DENOMINATOR"
        : null;
  const missingDimensionCount = eligibleRows.filter(
    (row) => !row.serviceId || !row.requestTypeId || !row.supportTeamId
  ).length;

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
      eligibleCount: sampleCount,
      excludedCount,
      missingEventCount: criticalCount,
      missingDimensionCount,
      legacyCount: 0,
      projectionLagSeconds: input.freshness.projectionLagSeconds,
      lastProjectedEventAt: input.freshness.lastProjectedEventAt,
    },
    automatedResolution: {
      percentage:
        reason === null
          ? percentageRoundHalfUp(confirmedAutomatedCount, sampleCount)
          : null,
      reason,
      sampleCount,
      confirmedAutomatedCount,
      convertedToTicketCount,
      humanInterventionCount,
      unknownOutcomeCount,
      excludedCount,
    },
  };
}

export async function getAutomatedResolutionReport(input: {
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
  return prisma.$transaction(async (transaction) => {
    const context = await readReportingQueryContext(transaction, asOf);
    const rows = await transaction.supportJourney.findMany({
      where: {
        definitionVersion: context.definitionVersion,
        startedAt: { gte: input.range.from, lt: input.range.to },
        ...(scope.type === "TEAMS"
          ? { supportTeamId: { in: scope.teamIds } }
          : {}),
      },
      select: journeySelect,
    });
    return buildAutomatedResolutionReport({
      ...context,
      asOf,
      range: input.range,
      scope,
      rows,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
