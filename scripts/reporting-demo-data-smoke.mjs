import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const KPI_DEFINITION_VERSION = "KPI-V1";
const REPORTING_PROJECTION_CONSUMER = "REPORTING_TICKET_FACT_KPI_V1";
const REPORTING_PROVIDER_CODE = "DEMO_PRODUCT_SEED";

function assertLocalDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const hostname = new URL(databaseUrl).hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error("Reporting demo verification is restricted to a local database");
  }
}

function localDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function tehranMidnight(value) {
  return new Date(`${value}T00:00:00+03:30`);
}

function requireCoverage(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  assertLocalDatabase();
  const today = localDate();
  const rangeTo = tehranMidnight(today);
  const rangeFrom = tehranMidnight(shiftDate(today, -30));
  const factRange = {
    definitionVersion: KPI_DEFINITION_VERSION,
    ticketCreatedAt: { gte: rangeFrom, lt: rangeTo },
    dataQualityStatus: "HEALTHY",
  };
  const [
    healthyFacts,
    firstResponseSamples,
    resolutionSamples,
    closedSamples,
    ratedSamples,
    achievedFcr,
    missedFcr,
    reopenedSamples,
    metCombinedSla,
    breachedCombinedSla,
    supportJourneyGroups,
    paymentVolumes,
    recurringSignals,
    sourceAggregate,
    processedEvents,
    checkpoint,
    adminNotifications,
    unreadAdminNotifications,
    readAdminNotifications,
  ] = await Promise.all([
    prisma.ticketReportingFact.count({ where: factRange }),
    prisma.ticketReportingFact.count({
      where: { ...factRange, firstResponseEffectiveMilliseconds: { not: null } },
    }),
    prisma.ticketReportingFact.count({
      where: { ...factRange, resolutionEffectiveMilliseconds: { not: null } },
    }),
    prisma.ticketReportingFact.count({
      where: { ...factRange, firstClosedAt: { not: null } },
    }),
    prisma.ticketReportingFact.count({
      where: { ...factRange, rating: { not: null }, ratedAt: { not: null } },
    }),
    prisma.ticketReportingFact.count({ where: { ...factRange, fcrStatus: "ACHIEVED" } }),
    prisma.ticketReportingFact.count({ where: { ...factRange, fcrStatus: "NOT_ACHIEVED" } }),
    prisma.ticketReportingFact.count({
      where: { ...factRange, reopenedWithinWindow: true },
    }),
    prisma.ticketReportingFact.count({
      where: {
        ...factRange,
        firstResponseSlaState: "MET",
        resolutionSlaState: "MET",
      },
    }),
    prisma.ticketReportingFact.count({
      where: {
        ...factRange,
        firstResolvedAt: { not: null },
        OR: [
          { firstResponseSlaState: "BREACHED" },
          { resolutionSlaState: "BREACHED" },
        ],
      },
    }),
    prisma.supportJourney.groupBy({
      by: ["status"],
      where: { startedAt: { gte: rangeFrom, lt: rangeTo } },
      _count: { _all: true },
    }),
    prisma.transactionVolumeDaily.count({
      where: {
        providerCode: REPORTING_PROVIDER_CODE,
        transactionType: "PAYMENT",
        scopeType: "GLOBAL",
        scopeKey: "*",
        status: "VERIFIED",
        localDate: {
          gte: new Date(`${shiftDate(today, -30)}T00:00:00.000Z`),
          lt: new Date(`${today}T00:00:00.000Z`),
        },
      },
    }),
    prisma.recurringProblemSignal.count({
      where: { definitionVersion: KPI_DEFINITION_VERSION, status: "RECURRING" },
    }),
    prisma.outboxEvent.aggregate({
      where: { aggregateType: "TICKET" },
      _count: { _all: true },
      _max: { id: true },
    }),
    prisma.reportingProcessedEvent.count({
      where: { aggregateType: "TICKET" },
    }),
    prisma.reportingProjectionCheckpoint.findUnique({
      where: { consumerName: REPORTING_PROJECTION_CONSUMER },
    }),
    prisma.notification.count({ where: { recipientType: "ADMIN" } }),
    prisma.notification.count({ where: { recipientType: "ADMIN", isRead: false } }),
    prisma.notification.count({ where: { recipientType: "ADMIN", isRead: true } }),
  ]);

  const journeys = Object.fromEntries(
    supportJourneyGroups.map((group) => [group.status, group._count._all])
  );
  requireCoverage(healthyFacts >= 40, "Default dashboard range needs at least 40 healthy facts");
  requireCoverage(firstResponseSamples > 0, "First-response KPI has no sample");
  requireCoverage(resolutionSamples > 0, "Resolution-time KPI has no sample");
  requireCoverage(closedSamples >= 30, "Quality KPIs need at least 30 closed tickets");
  requireCoverage(ratedSamples >= 30, "CSAT publication threshold is not met");
  requireCoverage(achievedFcr > 0 && missedFcr > 0, "FCR needs achieved and missed examples");
  requireCoverage(reopenedSamples > 0, "Reopen KPI has no example");
  requireCoverage(
    metCombinedSla > 0 && breachedCombinedSla > 0,
    "SLA compliance needs met and breached examples"
  );
  requireCoverage(
    (journeys.CONFIRMED_RESOLVED ?? 0) > 0 &&
      (journeys.CONVERTED_TO_TICKET ?? 0) > 0 &&
      (journeys.CONTENT_SHOWN ?? 0) > 0,
    "Automated resolution needs all presentation outcomes"
  );
  requireCoverage(paymentVolumes === 30, "Payment denominator must cover all 30 report days");
  requireCoverage(recurringSignals > 0, "Recurring-problem KPI has no signal");
  requireCoverage(
    adminNotifications > 0 && unreadAdminNotifications > 0 && readAdminNotifications > 0,
    "Admin notifications need both read and unread demo examples"
  );
  requireCoverage(
    processedEvents === sourceAggregate._count._all &&
      checkpoint?.status === "HEALTHY" &&
      checkpoint.lastOutboxEventId === sourceAggregate._max.id,
    "Reporting projection is not reconciled with the source high watermark"
  );

  console.log(JSON.stringify({
    ok: true,
    range: { from: rangeFrom.toISOString(), to: rangeTo.toISOString() },
    healthyFacts,
    firstResponseSamples,
    resolutionSamples,
    closedSamples,
    ratedSamples,
    achievedFcr,
    missedFcr,
    reopenedSamples,
    metCombinedSla,
    breachedCombinedSla,
    journeys,
    paymentVolumes,
    recurringSignals,
    notifications: {
      admin: adminNotifications,
      adminUnread: unreadAdminNotifications,
      adminRead: readAdminNotifications,
    },
    sourceEvents: sourceAggregate._count._all,
    processedEvents,
  }));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      event: "reporting_demo_data_verification_failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error",
    }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
