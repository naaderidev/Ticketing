import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const safeTicketIdentifier = /^TK-[A-Z0-9-]{1,97}$/i;
const requiredSystemAdministratorWorkspacePermissions = [
  "support.workspace.access",
  "support.queue.read",
  "ticket.workspace.read",
  "ticket.workspace.assign",
  "ticket.workspace.transfer",
  "ticket.workspace.reply",
  "ticket.workspace.resolve",
];

try {
  const reconciliationTime = new Date();
  const [
    tickets,
    replies,
    messages,
    ticketsMissingMessages,
    activeAssignments,
    activeAssignmentGroups,
    events,
    outbox,
    unlinkedOutbox,
    unpublishedOutbox,
    outboxPayloads,
    missingCanonicalCore,
    quarantinedTickets,
    closedLegacyTickets,
    attachments,
    unlinkedAttachments,
    temporaryUsers,
    ticketIdentifiers,
    systemAdministratorRole,
    administrators,
  ] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticketReply.count(),
    prisma.ticketMessage.count(),
    prisma.ticket.count({ where: { messages: { none: {} } } }),
    prisma.ticketAssignment.count({ where: { endedAt: null } }),
    prisma.ticketAssignment.groupBy({
      by: ["ticketId"],
      where: { endedAt: null },
      _count: { _all: true },
    }),
    prisma.ticketEvent.count(),
    prisma.outboxEvent.count(),
    prisma.outboxEvent.count({ where: { ticketEventId: null } }),
    prisma.outboxEvent.count({ where: { publishedAt: null } }),
    prisma.outboxEvent.findMany({ select: { eventId: true, payload: true } }),
    prisma.ticket.count({
      where: {
        OR: [
          { lifecycleStatus: null },
          { priority: null },
          { routeVersion: null },
          { createdById: null },
          { partyId: null },
          { requestTypeId: null },
          { supportTeamId: null },
          { queueId: null },
        ],
      },
    }),
    prisma.ticket.count({
      where: { requestType: { code: "LEGACY_UNCLASSIFIED" } },
    }),
    prisma.ticket.count({ where: { lifecycleStatus: "CLOSED_LEGACY" } }),
    prisma.ticketAttachment.count(),
    prisma.ticketAttachment.count({ where: { messageId: null } }),
    prisma.user.count({ where: { email: { endsWith: "@example.invalid" } } }),
    prisma.ticket.findMany({ select: { ticketId: true } }),
    prisma.role.findUnique({
      where: { key: "SYSTEM_ADMINISTRATOR" },
      select: {
        permissions: {
          where: {
            permission: {
              key: { in: requiredSystemAdministratorWorkspacePermissions },
            },
          },
          select: { permission: { select: { key: true } } },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: "ADMIN" },
      select: {
        id: true,
        roleAssignments: {
          where: {
            role: { key: "SYSTEM_ADMINISTRATOR" },
            scopeType: "GLOBAL",
            scopeKey: "*",
            status: "ACTIVE",
            validFrom: { lte: reconciliationTime },
            OR: [{ validTo: null }, { validTo: { gt: reconciliationTime } }],
          },
          select: { id: true },
        },
      },
    }),
  ]);

  const duplicateActiveAssignments = activeAssignmentGroups.filter(
    (group) => group._count._all !== 1
  ).length;
  const outboxPayloadMismatches = outboxPayloads.filter(
    (row) =>
      typeof row.payload !== "object" ||
      row.payload === null ||
      Array.isArray(row.payload) ||
      row.payload.eventId !== row.eventId
  ).length;
  const invalidTicketIdentifiers = ticketIdentifiers.filter(
    ({ ticketId }) => !safeTicketIdentifier.test(ticketId)
  ).length;
  const systemAdministratorPermissionKeys = new Set(
    systemAdministratorRole?.permissions.map(({ permission }) => permission.key) ?? []
  );
  const missingSystemAdministratorWorkspacePermissions =
    requiredSystemAdministratorWorkspacePermissions.filter(
      (permission) => !systemAdministratorPermissionKeys.has(permission)
    ).length;
  const administratorsMissingGlobalAssignment = administrators.filter(
    (administrator) => administrator.roleAssignments.length === 0
  ).length;

  const result = {
    counts: {
      tickets,
      replies,
      messages,
      activeAssignments,
      events,
      outbox,
      unpublishedOutbox,
      quarantinedTickets,
      closedLegacyTickets,
      attachments,
    },
    invariants: {
      missingCanonicalCore,
      duplicateActiveAssignments,
      unlinkedOutbox,
      outboxPayloadMismatches,
      unlinkedAttachments,
      temporaryUsers,
      invalidTicketIdentifiers,
      missingSystemAdministratorWorkspacePermissions,
      administratorsMissingGlobalAssignment,
      ticketsMissingMessages,
      eventOutboxDifference: events - outbox,
    },
  };
  const ok = Object.values(result.invariants).every((value) => value === 0);
  console.log(JSON.stringify({ ok, ...result }));
  if (!ok) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
