import type { Prisma } from "@prisma/client";
import { REPORTING_PROJECTION_CONSUMER } from "@/modules/reporting/application/reporting-projection-service";
import {
  resolveReportingFreshness,
  type ReportingFreshness,
} from "@/modules/reporting/domain/reporting-freshness";
import { ReportingKpiError } from "@/modules/reporting/domain/reporting-kpi-error";

export type ReportingQueryContext = {
  definitionVersion: string;
  definitionEffectiveFrom: Date;
  freshness: ReportingFreshness;
};

export async function readReportingQueryContext(
  transaction: Prisma.TransactionClient,
  asOf: Date
): Promise<ReportingQueryContext> {
  const definition = await transaction.kpiDefinitionVersion.findUnique({
    where: { activeKey: "SUPPORT_KPI" },
    select: { version: true, status: true, effectiveFrom: true },
  });
  if (!definition || definition.status !== "ACTIVE") {
    throw new ReportingKpiError(
      "نسخه فعال قرارداد گزارش‌گیری در دسترس نیست",
      "DEPENDENCY_UNAVAILABLE",
      503
    );
  }

  const checkpoint = await transaction.reportingProjectionCheckpoint.findUnique({
    where: { consumerName: REPORTING_PROJECTION_CONSUMER },
    select: {
      definitionVersion: true,
      status: true,
      lastOutboxEventId: true,
      lastEventOccurredAt: true,
      lastProcessedAt: true,
    },
  });
  const oldestPendingEvent = await transaction.outboxEvent.findFirst({
    where: {
      aggregateType: "TICKET",
      ...(checkpoint?.lastOutboxEventId === null ||
      checkpoint?.lastOutboxEventId === undefined
        ? {}
        : { id: { gt: checkpoint.lastOutboxEventId } }),
    },
    orderBy: { id: "asc" },
    select: { occurredAt: true },
  });

  return {
    definitionVersion: definition.version,
    definitionEffectiveFrom: definition.effectiveFrom,
    freshness: resolveReportingFreshness(
      {
        definitionVersion: definition.version,
        checkpoint,
        oldestPendingEvent,
      },
      asOf
    ),
  };
}
