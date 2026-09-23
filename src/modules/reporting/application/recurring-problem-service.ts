import { createHash } from "node:crypto";
import {
  Prisma,
  type RecurringProblemSignalStatus,
  type ReportingDataQualityStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { conflictError, notFoundError, validationError } from "@/lib/domain-error";
import {
  reportingFactScopeWhere,
  resolveReportingAccessScope,
  resolveReportingTicketDrillDownWhere,
  type ReportingAccessScope,
} from "@/modules/reporting/application/reporting-authorization";
import { readReportingQueryContext } from "@/modules/reporting/application/reporting-query-context";
import type { RecurringProblemsReportQuery } from "@/modules/reporting/contracts/reporting-kpi-schemas";
import type { ReportingFreshness } from "@/modules/reporting/domain/reporting-freshness";
import { ReportingKpiError } from "@/modules/reporting/domain/reporting-kpi-error";
import {
  REPORTING_TIME_ZONE,
  reportingLocalDate,
  reportingMidnightInstant,
  shiftCalendarDate,
} from "@/modules/reporting/domain/reporting-local-date";
import {
  decimalRatioRoundHalfUp,
  percentageRoundHalfUp,
  signedDecimalRatioRoundHalfUp,
} from "@/modules/reporting/domain/reporting-statistics";

const WINDOW_DAYS = 7;
const BASELINE_DAYS = 28;
const MINIMUM_TICKETS = 5;
const MINIMUM_PARTIES = 3;

export type RecurringProblemFactRow = {
  ticketId: number;
  ticketCreatedAt: Date;
  serviceId: number | null;
  serviceCode: string | null;
  serviceName: string | null;
  requestTypeId: number | null;
  requestTypeCode: string | null;
  requestTypeName: string | null;
  normalizedRootCauseId: number | null;
  normalizedRootCauseCode: string | null;
  normalizedRootCauseName: string | null;
  incidentKey: string | null;
  partyKeyHash: string | null;
  dataQualityStatus: ReportingDataQualityStatus;
  legacyImported: boolean;
};

type GroupAccumulator = {
  serviceId: number;
  serviceCode: string;
  serviceName: string;
  requestTypeId: number;
  requestTypeCode: string;
  requestTypeName: string;
  normalizedRootCauseId: number | null;
  normalizedRootCauseCode: string | null;
  normalizedRootCauseName: string | null;
  incidentKey: string | null;
  ticketIds: Set<number>;
  partyKeys: Set<string>;
};

type DrillDownSignalReference = {
  signalKey: string;
  definitionVersion: string;
  windowStartedAt: Date;
  windowEndedAt: Date;
  serviceId: number;
  serviceCode: string;
  serviceName: string;
  requestTypeId: number;
  requestTypeCode: string;
  requestTypeName: string;
  normalizedRootCauseId: number | null;
  incidentKey: string | null;
  status: RecurringProblemSignalStatus;
  generatedAt: Date;
};

function isHealthy(row: RecurringProblemFactRow): boolean {
  return row.dataQualityStatus === "HEALTHY" && !row.legacyImported;
}

function hasRoutingDimensions(row: RecurringProblemFactRow) {
  return Boolean(
    row.serviceId && row.serviceCode && row.serviceName &&
    row.requestTypeId && row.requestTypeCode && row.requestTypeName
  );
}

function groupIdentity(row: RecurringProblemFactRow): string | null {
  if (row.incidentKey) return `INCIDENT:${row.incidentKey}`;
  if (
    row.normalizedRootCauseId &&
    row.normalizedRootCauseCode &&
    row.normalizedRootCauseName
  ) {
    return `CAUSE:${row.normalizedRootCauseId}`;
  }
  return null;
}

function groupKey(row: RecurringProblemFactRow): string | null {
  const identity = groupIdentity(row);
  return identity && row.serviceCode && row.requestTypeCode
    ? `${row.serviceCode}:${row.requestTypeCode}:${identity}`
    : null;
}

function accumulate(rows: readonly RecurringProblemFactRow[]) {
  const groups = new Map<string, GroupAccumulator>();
  for (const row of rows) {
    const key = groupKey(row);
    if (!key || !hasRoutingDimensions(row)) continue;
    const current = groups.get(key) ?? {
      serviceId: row.serviceId!,
      serviceCode: row.serviceCode!,
      serviceName: row.serviceName!,
      requestTypeId: row.requestTypeId!,
      requestTypeCode: row.requestTypeCode!,
      requestTypeName: row.requestTypeName!,
      normalizedRootCauseId: row.normalizedRootCauseId,
      normalizedRootCauseCode: row.normalizedRootCauseCode,
      normalizedRootCauseName: row.normalizedRootCauseName,
      incidentKey: row.incidentKey,
      ticketIds: new Set<number>(),
      partyKeys: new Set<string>(),
    };
    current.ticketIds.add(row.ticketId);
    if (row.partyKeyHash) current.partyKeys.add(row.partyKeyHash);
    groups.set(key, current);
  }
  return groups;
}

function signalKey(input: {
  definitionVersion: string;
  windowStartedAt: Date;
  windowEndedAt: Date;
  groupKey: string;
}) {
  return createHash("sha256")
    .update(`${input.definitionVersion}:${input.windowStartedAt.toISOString()}:${input.windowEndedAt.toISOString()}:${input.groupKey}`)
    .digest("hex");
}

export function buildRecurringProblemsReport(input: {
  definitionVersion: string;
  definitionEffectiveFrom: Date;
  asOf: Date;
  query: RecurringProblemsReportQuery;
  scope: ReportingAccessScope;
  freshness: ReportingFreshness;
  drillDownAvailable: boolean;
  rows: readonly RecurringProblemFactRow[];
}) {
  const endLocalDate = reportingLocalDate(input.query.to);
  const windowStartedAt = reportingMidnightInstant(
    shiftCalendarDate(endLocalDate, -WINDOW_DAYS)
  );
  const baselineStartedAt = reportingMidnightInstant(
    shiftCalendarDate(endLocalDate, -(WINDOW_DAYS + BASELINE_DAYS))
  );
  const baselineComplete = input.definitionEffectiveFrom <= baselineStartedAt;
  const rankingRows = input.rows.filter(
    (row) => row.ticketCreatedAt >= input.query.from && row.ticketCreatedAt < input.query.to
  );
  const currentRows = input.rows.filter(
    (row) => row.ticketCreatedAt >= windowStartedAt && row.ticketCreatedAt < input.query.to
  );
  const baselineRows = input.rows.filter(
    (row) => row.ticketCreatedAt >= baselineStartedAt && row.ticketCreatedAt < windowStartedAt
  );
  const healthyRanking = rankingRows.filter(isHealthy);
  const healthyRoutingRanking = healthyRanking.filter(hasRoutingDimensions);
  const rankingTotal = healthyRoutingRanking.length;
  const rankingGroups = new Map<string, { serviceId: number; serviceCode: string; serviceName: string; requestTypeId: number; requestTypeCode: string; requestTypeName: string; count: number }>();
  for (const row of healthyRoutingRanking) {
    const key = `${row.serviceCode}:${row.requestTypeCode}`;
    const group = rankingGroups.get(key) ?? {
      serviceId: row.serviceId!, serviceCode: row.serviceCode!, serviceName: row.serviceName!,
      requestTypeId: row.requestTypeId!, requestTypeCode: row.requestTypeCode!, requestTypeName: row.requestTypeName!, count: 0,
    };
    group.count += 1;
    rankingGroups.set(key, group);
  }
  const eligibleCauseRows = currentRows.filter(
    (row) => isHealthy(row) && hasRoutingDimensions(row) && groupIdentity(row) !== null
  );
  const currentGroups = accumulate(eligibleCauseRows);
  const baselineGroups = accumulate(
    baselineRows.filter((row) => isHealthy(row) && hasRoutingDimensions(row) && groupIdentity(row) !== null)
  );
  const groups = [...currentGroups.entries()].map(([key, group]) => {
    const ticketCount = group.ticketIds.size;
    const distinctPartyCount = group.partyKeys.size;
    const baselineTicketCount = baselineGroups.get(key)?.ticketIds.size ?? 0;
    const minimumVolumeMet = ticketCount >= MINIMUM_TICKETS && distinctPartyCount >= MINIMUM_PARTIES;
    const baselineWeeklyAverage = baselineComplete
      ? decimalRatioRoundHalfUp(baselineTicketCount, 4, 2)
      : null;
    const growthPercent = baselineComplete && baselineTicketCount > 0
      ? signedDecimalRatioRoundHalfUp(
          (ticketCount * 4 - baselineTicketCount) * 100,
          baselineTicketCount,
          2
        )
      : null;
    const doubledBaseline = baselineTicketCount === 0 || ticketCount * 4 >= baselineTicketCount * 2;
    const status = !minimumVolumeMet
      ? "BELOW_THRESHOLD" as const
      : !baselineComplete
        ? "NEW_SIGNAL" as const
        : doubledBaseline
          ? "RECURRING" as const
          : "BELOW_THRESHOLD" as const;
    return {
      signalKey: signalKey({ definitionVersion: input.definitionVersion, windowStartedAt, windowEndedAt: input.query.to, groupKey: key }),
      service: { id: group.serviceId, code: group.serviceCode, name: group.serviceName },
      requestType: { id: group.requestTypeId, code: group.requestTypeCode, name: group.requestTypeName },
      normalizedRootCause: group.normalizedRootCauseId
        ? { id: group.normalizedRootCauseId, code: group.normalizedRootCauseCode!, name: group.normalizedRootCauseName! }
        : null,
      incidentKey: group.incidentKey,
      ticketCount,
      distinctPartyCount,
      sharePercentage: percentageRoundHalfUp(ticketCount, eligibleCauseRows.length),
      baselineWeeklyAverage,
      growthPercent,
      status,
      drillDownAvailable: input.drillDownAvailable,
    };
  }).sort((left, right) => right.ticketCount - left.ticketCount || left.signalKey.localeCompare(right.signalKey));
  const recurringTicketCount = groups
    .filter((group) => group.status === "RECURRING")
    .reduce((sum, group) => sum + group.ticketCount, 0);
  const criticalCount = currentRows.filter(
    (row) => !row.legacyImported && row.dataQualityStatus !== "HEALTHY"
  ).length + eligibleCauseRows.filter((row) => !row.partyKeyHash).length;
  const reason = input.freshness.status === "UNAVAILABLE"
    ? "PROJECTION_UNAVAILABLE" as const
    : criticalCount > 0
      ? "CRITICAL_DATA_QUALITY" as const
      : eligibleCauseRows.length === 0
        ? "ZERO_DENOMINATOR" as const
        : null;

  return {
    definitionVersion: input.definitionVersion,
    asOf: input.asOf.toISOString(),
    timeZone: REPORTING_TIME_ZONE,
    range: { from: input.query.from.toISOString(), to: input.query.to.toISOString(), boundary: "HALF_OPEN" as const },
    recurringWindow: {
      from: windowStartedAt.toISOString(),
      to: input.query.to.toISOString(),
      days: WINDOW_DAYS,
      baselineFrom: baselineComplete ? baselineStartedAt.toISOString() : null,
      baselineTo: baselineComplete ? windowStartedAt.toISOString() : null,
      baselineDays: BASELINE_DAYS,
      baselineComplete,
    },
    scope: input.scope,
    freshness: input.freshness,
    dataQuality: {
      eligibleCount: healthyRoutingRanking.length,
      excludedCount: rankingRows.length - healthyRoutingRanking.length,
      eligibleCauseTicketCount: eligibleCauseRows.length,
      missingDimensionCount: rankingRows.filter((row) => isHealthy(row) && !hasRoutingDimensions(row)).length + eligibleCauseRows.filter((row) => !row.partyKeyHash).length,
      legacyCount: rankingRows.filter((row) => row.legacyImported).length,
      projectionLagSeconds: input.freshness.projectionLagSeconds,
      lastProjectedEventAt: input.freshness.lastProjectedEventAt,
    },
    ranking: [...rankingGroups.values()]
      .sort((left, right) => right.count - left.count || left.requestTypeCode.localeCompare(right.requestTypeCode))
      .slice(0, input.query.limit)
      .map((group) => ({ ...group, sharePercentage: percentageRoundHalfUp(group.count, rankingTotal) })),
    recurringRate: {
      percentage: reason === null ? percentageRoundHalfUp(recurringTicketCount, eligibleCauseRows.length) : null,
      reason,
      recurringTicketCount,
      eligibleCauseTicketCount: eligibleCauseRows.length,
    },
    groups: groups.slice(0, input.query.limit),
    thresholds: { minimumTickets: MINIMUM_TICKETS, minimumDistinctParties: MINIMUM_PARTIES, growthMultiplier: 2, windowDays: WINDOW_DAYS, baselineDays: BASELINE_DAYS },
  };
}

async function readRows(
  transaction: Prisma.TransactionClient,
  input: { from: Date; to: Date; scope: ReportingAccessScope; definitionVersion: string }
) {
  return transaction.ticketReportingFact.findMany({
    where: {
      definitionVersion: input.definitionVersion,
      ticketCreatedAt: { gte: input.from, lt: input.to },
      ...reportingFactScopeWhere(input.scope),
    },
    select: {
      ticketId: true, ticketCreatedAt: true, serviceId: true, serviceCode: true, serviceName: true,
      requestTypeId: true, requestTypeCode: true, requestTypeName: true,
      normalizedRootCauseId: true, normalizedRootCauseCode: true, normalizedRootCauseName: true,
      incidentKey: true, partyKeyHash: true, dataQualityStatus: true, legacyImported: true,
    },
  });
}

async function resolveOnDemandSignal(
  transaction: Prisma.TransactionClient,
  input: {
    signalKey: string;
    range: Pick<RecurringProblemsReportQuery, "from" | "to">;
    scope: ReportingAccessScope;
    now: Date;
  }
): Promise<DrillDownSignalReference | null> {
  const context = await readReportingQueryContext(transaction, input.now);
  const baselineStart = reportingMidnightInstant(
    shiftCalendarDate(reportingLocalDate(input.range.to), -(WINDOW_DAYS + BASELINE_DAYS))
  );
  const rows = await readRows(transaction, {
    from: input.range.from < baselineStart ? input.range.from : baselineStart,
    to: input.range.to,
    scope: input.scope,
    definitionVersion: context.definitionVersion,
  });
  const report = buildRecurringProblemsReport({
    ...context,
    asOf: input.now,
    query: { ...input.range, limit: 100 },
    scope: input.scope,
    drillDownAvailable: true,
    rows,
  });
  const group = report.groups.find(({ signalKey: key }) => key === input.signalKey);
  if (!group) return null;

  return {
    signalKey: group.signalKey,
    definitionVersion: report.definitionVersion,
    windowStartedAt: new Date(report.recurringWindow.from),
    windowEndedAt: new Date(report.recurringWindow.to),
    serviceId: group.service.id,
    serviceCode: group.service.code,
    serviceName: group.service.name,
    requestTypeId: group.requestType.id,
    requestTypeCode: group.requestType.code,
    requestTypeName: group.requestType.name,
    normalizedRootCauseId: group.normalizedRootCause?.id ?? null,
    incidentKey: group.incidentKey,
    status: group.status,
    generatedAt: input.now,
  };
}

export async function getRecurringProblemsReport(input: {
  actorUserId: number;
  query: RecurringProblemsReportQuery;
  now?: Date;
}) {
  const asOf = input.now ?? new Date();
  const scope = await resolveReportingAccessScope(input.actorUserId, asOf);
  if (!scope) throw new ReportingKpiError("دسترسی به گزارش‌های مدیریتی مجاز نیست", "FORBIDDEN", 403);
  const drillDownAvailable =
    scope.accessMode === "MANAGEMENT" &&
    (await resolveReportingTicketDrillDownWhere(input.actorUserId, asOf)) !== null;
  return prisma.$transaction(async (transaction) => {
    const context = await readReportingQueryContext(transaction, asOf);
    const baselineStart = reportingMidnightInstant(
      shiftCalendarDate(reportingLocalDate(input.query.to), -(WINDOW_DAYS + BASELINE_DAYS))
    );
    const rows = await readRows(transaction, {
      from: input.query.from < baselineStart ? input.query.from : baselineStart,
      to: input.query.to,
      scope,
      definitionVersion: context.definitionVersion,
    });
    return buildRecurringProblemsReport({
      ...context,
      asOf,
      query: input.query,
      scope,
      drillDownAvailable,
      rows,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function getRecurringProblemDrillDown(input: {
  actorUserId: number;
  signalKey: string;
  limit: number;
  range?: Pick<RecurringProblemsReportQuery, "from" | "to">;
  now?: Date;
}) {
  if (!/^[a-f0-9]{64}$/.test(input.signalKey)) {
    throw validationError("شناسه سیگنال معتبر نیست");
  }
  const now = input.now ?? new Date();
  const scope = await resolveReportingAccessScope(input.actorUserId, now);
  if (!scope || scope.accessMode !== "MANAGEMENT") {
    throw new ReportingKpiError(
      "دسترسی به جزئیات مشکلات پرتکرار مجاز نیست",
      "FORBIDDEN",
      403
    );
  }
  const ticketReadWhere = await resolveReportingTicketDrillDownWhere(
    input.actorUserId,
    now
  );
  if (!ticketReadWhere) {
    throw new ReportingKpiError(
      "دسترسی عادی مشاهده تیکت برای Drill-down مجاز نیست",
      "FORBIDDEN",
      403
    );
  }
  return prisma.$transaction(async (transaction) => {
    const signal = input.range
      ? await resolveOnDemandSignal(transaction, {
          signalKey: input.signalKey,
          range: input.range,
          scope,
          now,
        })
      : await transaction.recurringProblemSignal.findUnique({
          where: { signalKey: input.signalKey },
          select: {
            signalKey: true,
            definitionVersion: true,
            windowStartedAt: true,
            windowEndedAt: true,
            serviceId: true,
            serviceCode: true,
            serviceName: true,
            requestTypeId: true,
            requestTypeCode: true,
            requestTypeName: true,
            normalizedRootCauseId: true,
            incidentKey: true,
            status: true,
            generatedAt: true,
          },
        });
    if (!signal) throw notFoundError("سیگنال مشکل پرتکرار یافت نشد");
    if (!signal.incidentKey && !signal.normalizedRootCauseId) {
      throw notFoundError("مرجع استاندارد سیگنال مشکل پرتکرار یافت نشد");
    }
    const identityWhere: Prisma.TicketReportingFactWhereInput = signal.incidentKey
      ? { incidentKey: signal.incidentKey }
      : { normalizedRootCauseId: signal.normalizedRootCauseId };
    const facts = await transaction.ticketReportingFact.findMany({
      where: {
        definitionVersion: signal.definitionVersion,
        ticketCreatedAt: { gte: signal.windowStartedAt, lt: signal.windowEndedAt },
        serviceId: signal.serviceId,
        requestTypeId: signal.requestTypeId,
        dataQualityStatus: "HEALTHY",
        legacyImported: false,
        ...identityWhere,
        ...reportingFactScopeWhere(scope),
        ...ticketReadWhere,
      },
      orderBy: [{ ticketCreatedAt: "desc" }, { ticketId: "desc" }],
      take: Math.min(input.limit, 100),
      select: {
        ticket: {
          select: {
            ticketId: true,
            subject: true,
            lifecycleStatus: true,
            priority: true,
            createdAt: true,
          },
        },
      },
    });
    return {
      signal: {
        ...signal,
        windowStartedAt: signal.windowStartedAt.toISOString(),
        windowEndedAt: signal.windowEndedAt.toISOString(),
        generatedAt: signal.generatedAt.toISOString(),
      },
      scope,
      tickets: facts.map(({ ticket }) => ({
        ...ticket,
        createdAt: ticket.createdAt.toISOString(),
      })),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function generateRecurringProblemSignals(now = new Date()) {
  const windowEndedAt = reportingMidnightInstant(reportingLocalDate(now));
  const query = {
    from: reportingMidnightInstant(shiftCalendarDate(reportingLocalDate(windowEndedAt), -WINDOW_DAYS)),
    to: windowEndedAt,
    limit: Number.MAX_SAFE_INTEGER,
  };
  return prisma.$transaction(async (transaction) => {
    const context = await readReportingQueryContext(transaction, now);
    if (context.freshness.status === "UNAVAILABLE") {
      throw conflictError("Projection گزارش‌ها برای تولید سیگنال آماده نیست");
    }
    const baselineStart = reportingMidnightInstant(
      shiftCalendarDate(reportingLocalDate(windowEndedAt), -(WINDOW_DAYS + BASELINE_DAYS))
    );
    const rows = await readRows(transaction, {
      from: baselineStart,
      to: windowEndedAt,
      scope: { type: "GLOBAL", accessMode: "MANAGEMENT", teamIds: null },
      definitionVersion: context.definitionVersion,
    });
    const report = buildRecurringProblemsReport({
      ...context,
      asOf: now,
      query,
      scope: { type: "GLOBAL", accessMode: "MANAGEMENT", teamIds: null },
      drillDownAvailable: false,
      rows,
    });
    for (const group of report.groups) {
      await transaction.recurringProblemSignal.upsert({
        where: { signalKey: group.signalKey },
        create: {
          signalKey: group.signalKey,
          definitionVersion: context.definitionVersion,
          windowStartedAt: query.from,
          windowEndedAt,
          baselineStartedAt: report.recurringWindow.baselineComplete ? baselineStart : null,
          baselineEndedAt: report.recurringWindow.baselineComplete ? query.from : null,
          serviceId: group.service.id,
          serviceCode: group.service.code,
          serviceName: group.service.name,
          requestTypeId: group.requestType.id,
          requestTypeCode: group.requestType.code,
          requestTypeName: group.requestType.name,
          normalizedRootCauseId: group.normalizedRootCause?.id,
          incidentKey: group.incidentKey,
          ticketCount: group.ticketCount,
          distinctPartyCount: group.distinctPartyCount,
          eligibleCauseTicketCount: report.recurringRate.eligibleCauseTicketCount,
          baselineWeeklyAverage: group.baselineWeeklyAverage,
          growthPercent: group.growthPercent,
          status: group.status,
          generatedAt: now,
        },
        update: {
          ticketCount: group.ticketCount,
          distinctPartyCount: group.distinctPartyCount,
          eligibleCauseTicketCount: report.recurringRate.eligibleCauseTicketCount,
          baselineWeeklyAverage: group.baselineWeeklyAverage,
          growthPercent: group.growthPercent,
          status: group.status,
          generatedAt: now,
        },
      });
    }
    return {
      definitionVersion: context.definitionVersion,
      windowStartedAt: query.from.toISOString(),
      windowEndedAt: windowEndedAt.toISOString(),
      generated: report.groups.length,
      recurring: report.groups.filter((group) => group.status === "RECURRING").length,
      newSignals: report.groups.filter((group) => group.status === "NEW_SIGNAL").length,
      belowThreshold: report.groups.filter((group) => group.status === "BELOW_THRESHOLD").length,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
