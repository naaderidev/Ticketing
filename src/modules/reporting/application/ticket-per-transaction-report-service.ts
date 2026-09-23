import { Prisma, type ReportingDataQualityStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notFoundError } from "@/lib/domain-error";
import {
  resolveReportingAccessScope,
  type ReportingAccessScope,
} from "@/modules/reporting/application/reporting-authorization";
import { readReportingQueryContext } from "@/modules/reporting/application/reporting-query-context";
import type { TicketPerTransactionReportQuery } from "@/modules/reporting/contracts/reporting-kpi-schemas";
import type { ReportingFreshness } from "@/modules/reporting/domain/reporting-freshness";
import { ReportingKpiError } from "@/modules/reporting/domain/reporting-kpi-error";
import {
  REPORTING_TIME_ZONE,
  reportingDateColumn,
  reportingLocalDates,
} from "@/modules/reporting/domain/reporting-local-date";
import { decimalRatioBigIntRoundHalfUp } from "@/modules/reporting/domain/reporting-statistics";

const ORGANIZATION_BREAKDOWN_MINIMUM_TICKETS = 5;

export function requirePublishableOrganizationBreakdown(
  organizationId: number | undefined,
  ticketCount: number
): void {
  if (
    organizationId !== undefined &&
    ticketCount < ORGANIZATION_BREAKDOWN_MINIMUM_TICKETS
  ) {
    throw notFoundError("نمونه کافی برای انتشار گزارش سازمانی وجود ندارد");
  }
}

type TicketRow = {
  dataQualityStatus: ReportingDataQualityStatus;
  legacyImported: boolean;
  hasVerifiedCompatibleReference: boolean;
};

type VolumeRow = {
  localDate: Date;
  successfulTransactionCount: bigint;
  status: "PROVISIONAL" | "VERIFIED" | "REJECTED";
  sourceVersion: string;
};

type MetricReason =
  | "DENOMINATOR_UNAVAILABLE"
  | "PROJECTION_UNAVAILABLE"
  | "CRITICAL_DATA_QUALITY";

export function buildTicketPerTransactionReport(input: {
  definitionVersion: string;
  asOf: Date;
  query: TicketPerTransactionReportQuery;
  scope: ReportingAccessScope;
  freshness: ReportingFreshness;
  ticketRows: readonly TicketRow[];
  volumeRows: readonly VolumeRow[];
}) {
  const expectedDates = reportingLocalDates(input.query.from, input.query.to);
  const expectedDateSet = new Set(expectedDates);
  const receivedRows = input.volumeRows.filter((row) =>
    expectedDateSet.has(row.localDate.toISOString().slice(0, 10))
  );
  const verifiedRows = receivedRows.filter((row) => row.status === "VERIFIED");
  const eligibleTicketCount = input.ticketRows.filter(
    (row) =>
      row.dataQualityStatus === "HEALTHY" &&
      !row.legacyImported &&
      row.hasVerifiedCompatibleReference
  ).length;
  const criticalTicketCount = input.ticketRows.filter(
    (row) => row.dataQualityStatus !== "HEALTHY" && !row.legacyImported
  ).length;
  const hasCompleteVerifiedDenominator =
    receivedRows.length === expectedDates.length &&
    verifiedRows.length === expectedDates.length;
  const successfulTransactionCount = hasCompleteVerifiedDenominator
    ? verifiedRows.reduce(
        (sum, row) => sum + row.successfulTransactionCount,
        BigInt(0)
      )
    : null;

  let reason: MetricReason | null = null;
  if (input.freshness.status === "UNAVAILABLE") {
    reason = "PROJECTION_UNAVAILABLE";
  } else if (criticalTicketCount > 0) {
    reason = "CRITICAL_DATA_QUALITY";
  } else if (
    successfulTransactionCount === null ||
    successfulTransactionCount === BigInt(0)
  ) {
    reason = "DENOMINATOR_UNAVAILABLE";
  }

  return {
    definitionVersion: input.definitionVersion,
    asOf: input.asOf.toISOString(),
    timeZone: REPORTING_TIME_ZONE,
    range: {
      from: input.query.from.toISOString(),
      to: input.query.to.toISOString(),
      boundary: "HALF_OPEN" as const,
    },
    scope: input.scope,
    transactionScope: input.query.organizationId
      ? { type: "ORGANIZATION" as const, organizationId: input.query.organizationId }
      : { type: "GLOBAL" as const, organizationId: null },
    provider: {
      code: input.query.providerCode,
      transactionType: input.query.transactionType,
      sourceVersions: [...new Set(receivedRows.map((row) => row.sourceVersion))].sort(),
    },
    freshness: input.freshness,
    dataQuality: {
      eligibleTicketCount,
      excludedTicketCount: input.ticketRows.length - eligibleTicketCount,
      criticalTicketCount,
      expectedBucketCount: expectedDates.length,
      receivedBucketCount: receivedRows.length,
      verifiedBucketCount: verifiedRows.length,
      provisionalBucketCount: receivedRows.filter(
        (row) => row.status === "PROVISIONAL"
      ).length,
      rejectedBucketCount: receivedRows.filter((row) => row.status === "REJECTED").length,
      missingBucketCount: Math.max(0, expectedDates.length - receivedRows.length),
      projectionLagSeconds: input.freshness.projectionLagSeconds,
      lastProjectedEventAt: input.freshness.lastProjectedEventAt,
    },
    ticketPerTransaction: {
      value:
        reason === null && successfulTransactionCount !== null
          ? decimalRatioBigIntRoundHalfUp(
              BigInt(eligibleTicketCount) * BigInt(1_000),
              successfulTransactionCount
            )
          : null,
      unit: "TICKETS_PER_1000_SUCCESSFUL_TRANSACTIONS" as const,
      reason,
      verifiedUniqueTicketCount: eligibleTicketCount,
      successfulTransactionCount: successfulTransactionCount?.toString() ?? null,
    },
  };
}

async function readReport(
  transaction: Prisma.TransactionClient,
  input: {
    query: TicketPerTransactionReportQuery;
    scope: ReportingAccessScope;
    asOf: Date;
  }
) {
  const context = await readReportingQueryContext(transaction, input.asOf);
  if (input.query.organizationId) {
    const organization = await transaction.organization.findUnique({
      where: { id: input.query.organizationId },
      select: { id: true },
    });
    if (!organization) throw notFoundError("سازمان گزارش یافت نشد");
  }
  const referenceWhere = {
    verificationStatus: "VERIFIED" as const,
    referenceType: input.query.transactionType,
    entityType: input.query.transactionType,
    sourceSystem: input.query.providerCode,
  };
  const ticketFacts = await transaction.ticketReportingFact.findMany({
    where: {
      definitionVersion: context.definitionVersion,
      ticketCreatedAt: { gte: input.query.from, lt: input.query.to },
      ...(input.query.organizationId
        ? { organizationId: input.query.organizationId }
        : {}),
    },
    select: {
      dataQualityStatus: true,
      legacyImported: true,
      ticket: {
        select: {
          businessReferences: {
            where: referenceWhere,
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  requirePublishableOrganizationBreakdown(
    input.query.organizationId,
    ticketFacts.length
  );
  const expectedDates = reportingLocalDates(input.query.from, input.query.to);
  const volumes = await transaction.transactionVolumeDaily.findMany({
    where: {
      providerCode: input.query.providerCode,
      transactionType: input.query.transactionType,
      localDate: {
        in: expectedDates.map(reportingDateColumn),
      },
      scopeType: input.query.organizationId ? "ORGANIZATION" : "GLOBAL",
      scopeKey: input.query.organizationId?.toString() ?? "*",
      organizationId: input.query.organizationId ?? null,
    },
    select: {
      localDate: true,
      successfulTransactionCount: true,
      status: true,
      sourceVersion: true,
    },
    orderBy: { localDate: "asc" },
  });

  return buildTicketPerTransactionReport({
    definitionVersion: context.definitionVersion,
    asOf: input.asOf,
    query: input.query,
    scope: input.scope,
    freshness: context.freshness,
    ticketRows: ticketFacts.map((fact) => ({
      dataQualityStatus: fact.dataQualityStatus,
      legacyImported: fact.legacyImported,
      hasVerifiedCompatibleReference: fact.ticket.businessReferences.length > 0,
    })),
    volumeRows: volumes,
  });
}

export async function getTicketPerTransactionReport(input: {
  actorUserId: number;
  query: TicketPerTransactionReportQuery;
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
  if (scope.type !== "GLOBAL") {
    throw new ReportingKpiError(
      "مخرج سازمانی یا سراسری با دسترسی محدود تیمی قابل ترکیب نیست",
      "FORBIDDEN",
      403
    );
  }
  if (scope.accessMode === "AUDIT" && input.query.organizationId) {
    throw new ReportingKpiError(
      "گزارش سازمانی تفکیک‌شده برای دسترسی ممیزی منتشر نمی‌شود",
      "FORBIDDEN",
      403
    );
  }
  return prisma.$transaction(
    (transaction) => readReport(transaction, { query: input.query, scope, asOf }),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
}
