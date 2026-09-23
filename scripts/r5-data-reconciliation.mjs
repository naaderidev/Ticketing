import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const consumer = "SLA_ROUTING_V1";

try {
  const [
    tickets,
    ticketSlas,
    policies,
    calendars,
    routingDecisions,
    outboxEvents,
    deliveryGroups,
    missingTicketSlas,
    missingRoutingDecisions,
    activeRoutesWithoutSla,
    invalidLegacySnapshots,
    activePauses,
    invalidActivePauses,
    slaRows,
  ] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticketSla.count(),
    prisma.slaPolicy.count(),
    prisma.slaCalendar.count(),
    prisma.routingDecision.count(),
    prisma.outboxEvent.count(),
    prisma.outboxDelivery.groupBy({
      by: ["status"],
      where: { consumer },
      _count: { _all: true },
    }),
    prisma.ticket.count({ where: { sla: null } }),
    prisma.ticket.count({ where: { routingDecisions: { none: {} } } }),
    prisma.supportCatalogRoute.count({
      where: { status: "ACTIVE", slaPolicyId: null },
    }),
    prisma.ticketSla.count({
      where: {
        legacyImported: true,
        OR: [
          { firstResponseState: { not: "NOT_APPLICABLE" } },
          { resolutionState: { not: "NOT_APPLICABLE" } },
        ],
      },
    }),
    prisma.ticketSlaPause.findMany({
      where: { endedAt: null },
      select: { ticketSlaId: true, activeKey: true, ticketSla: { select: { pausedAt: true } } },
    }),
    prisma.ticketSlaPause.count({
      where: {
        OR: [
          { endedAt: null, activeKey: null },
          { endedAt: { not: null }, activeKey: { not: null } },
        ],
      },
    }),
    prisma.ticketSla.findMany({
      select: {
        firstResponseWarning70At: true,
        firstResponseWarning90At: true,
        firstResponseDueAt: true,
        resolutionWarning70At: true,
        resolutionWarning90At: true,
        resolutionDueAt: true,
        resolutionManagerAt: true,
      },
    }),
  ]);

  const deliveries = Object.fromEntries(
    deliveryGroups.map((row) => [row.status, row._count._all])
  );
  const deliveryTotal = deliveryGroups.reduce(
    (total, row) => total + row._count._all,
    0
  );
  const duplicateActivePauses = activePauses.length - new Set(
    activePauses.map((pause) => pause.ticketSlaId.toString())
  ).size;
  const activePauseSnapshotMismatches = activePauses.filter(
    (pause) => pause.activeKey === null || pause.ticketSla.pausedAt === null
  ).length;
  const invalidMilestoneOrder = slaRows.filter(
    (sla) =>
      sla.firstResponseWarning70At > sla.firstResponseWarning90At ||
      sla.firstResponseWarning90At > sla.firstResponseDueAt ||
      sla.resolutionWarning70At > sla.resolutionWarning90At ||
      sla.resolutionWarning90At > sla.resolutionDueAt ||
      sla.resolutionDueAt > sla.resolutionManagerAt
  ).length;

  const result = {
    counts: {
      tickets,
      ticketSlas,
      policies,
      calendars,
      routingDecisions,
      outboxEvents,
      outboxDeliveries: deliveryTotal,
      deliveryStatus: deliveries,
      activePauses: activePauses.length,
    },
    invariants: {
      missingTicketSlas,
      ticketSlaDifference: tickets - ticketSlas,
      missingRoutingDecisions,
      activeRoutesWithoutSla,
      invalidLegacySnapshots,
      invalidActivePauses,
      duplicateActivePauses,
      activePauseSnapshotMismatches,
      invalidMilestoneOrder,
      outboxDeliveryDifference: outboxEvents - deliveryTotal,
      pendingDeliveries: deliveries.PENDING ?? 0,
      processingDeliveries: deliveries.PROCESSING ?? 0,
      retryDeliveries: deliveries.RETRY ?? 0,
      deadLetterDeliveries: deliveries.DEAD_LETTER ?? 0,
    },
  };
  const ok = Object.values(result.invariants).every((value) => value === 0);
  console.log(JSON.stringify({ ok, ...result }));
  if (!ok) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
