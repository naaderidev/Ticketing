import { randomBytes } from "node:crypto";
import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { getPartyContextSnapshot } from "@/modules/organizations/application/party-context-service";
import {
  hasAnySupportPermission,
  SUPPORT_PERMISSIONS,
} from "@/modules/support-catalog/application/support-authorization";
import type { CreateIncidentInput } from "@/modules/incidents/contracts/incident-schemas";
import { IncidentError } from "@/modules/incidents/domain/incident-error";

const incidentInclude = {
  impacts: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      partyId: true,
      organizationId: true,
      referenceType: true,
      referenceKey: true,
      displayLabel: true,
      notifiedAt: true,
    },
  },
  ticketLinks: {
    orderBy: { linkedAt: "asc" as const },
    select: {
      linkedAt: true,
      ticket: { select: { ticketId: true, subject: true, lifecycleStatus: true } },
    },
  },
} as const;

type IncidentRecord = Awaited<ReturnType<typeof loadIncidentRecord>>;

async function requireStaff(userId: number, manage = false) {
  const allowed = await hasAnySupportPermission(
    userId,
    manage ? SUPPORT_PERMISSIONS.TICKET_RESOLVE : SUPPORT_PERMISSIONS.TICKET_READ
  );
  if (!allowed) throw new IncidentError("دسترسی به رخدادهای عمومی مجاز نیست", "FORBIDDEN", 403);
}

async function loadIncidentRecord(incidentKey: string) {
  const incident = await prisma.supportIncident.findUnique({
    where: { incidentKey },
    include: incidentInclude,
  });
  if (!incident) throw new IncidentError("رخداد عمومی یافت نشد", "NOT_FOUND", 404);
  return incident;
}

function toDto(incident: NonNullable<IncidentRecord>) {
  return {
    ...incident,
    detectedAt: incident.detectedAt.toISOString(),
    initialNoticeAt: incident.initialNoticeAt?.toISOString() ?? null,
    resolvedAt: incident.resolvedAt?.toISOString() ?? null,
    closedAt: incident.closedAt?.toISOString() ?? null,
    createdAt: incident.createdAt.toISOString(),
    updatedAt: incident.updatedAt.toISOString(),
    impacts: incident.impacts.map((impact) => ({
      ...impact,
      notifiedAt: impact.notifiedAt?.toISOString() ?? null,
    })),
    ticketLinks: incident.ticketLinks.map((link) => ({
      linkedAt: link.linkedAt.toISOString(),
      ...link.ticket,
    })),
  };
}

function toCustomerDto(incident: NonNullable<IncidentRecord>) {
  return {
    incidentKey: incident.incidentKey,
    title: incident.title,
    description: incident.description,
    status: incident.status,
    severity: incident.severity,
    initialNotice: incident.initialNotice,
    initialNoticeAt: incident.initialNoticeAt?.toISOString() ?? null,
    resolutionSummary: incident.resolutionSummary,
    resolvedAt: incident.resolvedAt?.toISOString() ?? null,
    detectedAt: incident.detectedAt.toISOString(),
  };
}

export async function listWorkspaceIncidents(user: CurrentUser) {
  await requireStaff(user.id);
  const incidents = await prisma.supportIncident.findMany({
    orderBy: [{ status: "asc" }, { detectedAt: "desc" }],
    take: 100,
    include: incidentInclude,
  });
  return incidents.map(toDto);
}

export async function getWorkspaceIncident(user: CurrentUser, incidentKey: string) {
  await requireStaff(user.id);
  return toDto(await loadIncidentRecord(incidentKey));
}

export async function createWorkspaceIncident(user: CurrentUser, input: CreateIncidentInput) {
  await requireStaff(user.id, true);
  const tickets = input.linkedTicketIds.length
    ? await prisma.ticket.findMany({
        where: { ticketId: { in: [...new Set(input.linkedTicketIds)] } },
        select: {
          id: true,
          ticketId: true,
          partyId: true,
          organizationId: true,
          requestTypeId: true,
          requestType: { select: { service: { select: { code: true } } } },
        },
      })
    : [];
  if (tickets.length !== new Set(input.linkedTicketIds).size) {
    throw new IncidentError("یک یا چند تیکت مرتبط یافت نشد", "BUSINESS_RULE_VIOLATION", 422);
  }
  const partyIds = [...new Set([
    ...input.impactedPartyIds,
    ...tickets.flatMap((ticket) => ticket.partyId ? [ticket.partyId] : []),
  ])];
  if (partyIds.length === 0) {
    throw new IncidentError("حداقل یک مخاطب یا تیکت تحت تأثیر لازم است", "BUSINESS_RULE_VIOLATION", 422);
  }
  const parties = await prisma.party.findMany({
    where: { id: { in: partyIds }, status: "ACTIVE" },
    select: { id: true, displayName: true, organization: { select: { id: true } } },
  });
  if (parties.length !== partyIds.length) {
    throw new IncidentError("یک یا چند مخاطب معتبر نیست", "BUSINESS_RULE_VIOLATION", 422);
  }
  const organizationByParty = new Map(
    parties.map((party) => [party.id, party.organization?.id ?? null])
  );
  const inferredRequestTypeIds = [...new Set(tickets.flatMap((ticket) => ticket.requestTypeId ? [ticket.requestTypeId] : []))];
  const inferredServiceCodes = [...new Set(tickets.flatMap((ticket) => ticket.requestType?.service.code ? [ticket.requestType.service.code] : []))];
  const incidentKey = `INC-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
  await prisma.$transaction(async (transaction) => {
    await transaction.supportIncident.create({
      data: {
        incidentKey,
        title: input.title,
        description: input.description,
        severity: input.severity,
        sourceType: input.sourceType,
        sourceReference: input.sourceReference,
        requestTypeId: input.requestTypeId ?? (inferredRequestTypeIds.length === 1 ? inferredRequestTypeIds[0] : null),
        serviceCode: input.serviceCode ?? (inferredServiceCodes.length === 1 ? inferredServiceCodes[0] : null),
        ownerTeamId: input.ownerTeamId,
        createdByUserId: user.id,
        status: "INVESTIGATING",
        impacts: {
          create: partyIds.map((partyId) => ({
            partyId,
            organizationId: organizationByParty.get(partyId) ?? null,
            displayLabel: parties.find((party) => party.id === partyId)?.displayName,
          })),
        },
        ticketLinks: { create: tickets.map((ticket) => ({ ticketId: ticket.id })) },
      },
    });
  });
  return toDto(await loadIncidentRecord(incidentKey));
}

export async function notifyWorkspaceIncident(user: CurrentUser, incidentKey: string, message: string) {
  await requireStaff(user.id, true);
  const current = await loadIncidentRecord(incidentKey);
  if (["RESOLVED", "CLOSED"].includes(current.status)) {
    throw new IncidentError("رخداد بسته‌شده قابل اطلاع‌رسانی اولیه نیست", "INVALID_TRANSITION", 409);
  }
  const now = new Date();
  await prisma.$transaction([
    prisma.supportIncident.update({
      where: { id: current.id },
      data: { initialNotice: message, initialNoticeAt: now },
    }),
    prisma.supportIncidentImpact.updateMany({
      where: { incidentId: current.id },
      data: { notifiedAt: now },
    }),
  ]);
  return toDto(await loadIncidentRecord(incidentKey));
}

export async function resolveWorkspaceIncident(user: CurrentUser, incidentKey: string, resolutionSummary: string) {
  await requireStaff(user.id, true);
  const current = await loadIncidentRecord(incidentKey);
  if (["RESOLVED", "CLOSED"].includes(current.status)) {
    throw new IncidentError("رخداد قبلاً رفع شده است", "INVALID_TRANSITION", 409);
  }
  await prisma.supportIncident.update({
    where: { id: current.id },
    data: { status: "RESOLVED", resolutionSummary, resolvedAt: new Date() },
  });
  return toDto(await loadIncidentRecord(incidentKey));
}

export async function listCustomerIncidents(user: CurrentUser) {
  const snapshot = await getPartyContextSnapshot(user);
  const incidents = await prisma.supportIncident.findMany({
    where: { impacts: { some: { partyId: snapshot.activePartyId } } },
    orderBy: { detectedAt: "desc" },
    take: 20,
    include: incidentInclude,
  });
  return incidents.map(toCustomerDto);
}
