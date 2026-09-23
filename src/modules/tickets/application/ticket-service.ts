import { createHash, randomUUID } from "node:crypto";
import { Prisma, type TicketLifecycleStatus } from "@prisma/client";
import type { CurrentUser } from "@/lib/current-user";
import { runSerializableTransaction } from "@/lib/database-transaction";
import {
  getPersistenceErrorCode,
  notFoundError,
} from "@/lib/domain-error";
import { hashSecurityValue } from "@/lib/request-security";
import { prisma } from "@/lib/prisma";
import { claimPendingUploads } from "@/lib/attachment-service";
import {
  publicAttachmentSelect,
  toAttachmentDto,
} from "@/lib/attachment-dto";
import {
  getPartyContextSnapshot,
  type PartyContextDto,
} from "@/modules/organizations/application/party-context-service";
import {
  decodeTicketCursor,
  encodeTicketCursor,
} from "@/modules/tickets/application/ticket-cursor";
import {
  decodeTicketTimelineCursor,
  encodeTicketTimelineCursor,
  type TicketTimelineCursor,
} from "@/modules/tickets/application/ticket-timeline-cursor";
import { appendTicketEvent } from "@/modules/tickets/application/ticket-event-outbox";
import type { TicketDomainEventType } from "@/modules/tickets/contracts/ticket-domain-events";
import { finishActiveResolutionCycle } from "@/modules/tickets/application/ticket-lifecycle-service";
import {
  appendTicketSlaStartedEvent,
  createTicketSlaSnapshot,
  markTicketResolved,
  recordRoutingDecision,
  restartTicketResolutionSla,
  resumeTicketResolutionSla,
  slaPolicyInclude,
  toPublicSlaDto,
} from "@/modules/sla-routing/application/sla-service";
import type {
  AddTicketMessageInput,
  CreateTicketV2Input,
  TicketListV2Query,
  TicketTimelineV2Query,
} from "@/modules/tickets/contracts/ticket-schemas";
import { TicketCommandError } from "@/modules/tickets/domain/ticket-command-error";
import {
  isExternalBusinessSubjectType,
  type ExternalBusinessSubjectType,
} from "@/modules/business-references/contracts/business-reference-contracts";
import {
  verifyBusinessReferences,
  type VerifiedBusinessReference,
} from "@/modules/business-references/application/business-reference-service";
import { isBusinessReferenceError } from "@/modules/business-references/domain/business-reference-error";
import { canTransitionTicket } from "@/modules/tickets/domain/ticket-state-machine";
import { requireExpectedTicketVersion } from "@/modules/tickets/domain/ticket-version";
import { linkSupportJourneyToTicket } from "@/modules/knowledge/application/support-journey-service";
import { SUPPORT_PERMISSIONS } from "@/modules/support-catalog/application/support-authorization";

const CREATE_TICKET_ROUTE = "POST /api/v2/tickets";
const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;

async function requireInitialTicketOwner(
  transaction: Prisma.TransactionClient,
  supportTeamId: number,
  now: Date,
) {
  const assignment = await transaction.userRoleAssignment.findFirst({
    where: {
      supportTeamId,
      scopeType: "SUPPORT_TEAM",
      scopeKey: String(supportTeamId),
      status: "ACTIVE",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
      role: {
        permissions: {
          some: { permission: { key: SUPPORT_PERMISSIONS.TICKET_READ } },
        },
      },
    },
    orderBy: [{ userId: "asc" }, { id: "asc" }],
    select: { userId: true },
  });
  if (!assignment) {
    throw new TicketCommandError(
      "برای تیم پشتیبانی این خدمت مالک فعال تعریف نشده است",
      "BUSINESS_RULE_VIOLATION",
      422,
    );
  }
  return assignment.userId;
}

type PreparedExternalReferences = {
  requestTypeId: number;
  subjectType: ExternalBusinessSubjectType;
  references: VerifiedBusinessReference[];
};

const customerTicketInclude = {
  requestType: {
    select: {
      code: true,
      name: true,
      service: { select: { code: true, name: true } },
    },
  },
  organization: { select: { id: true, legalName: true } },
  messages: {
    where: { visibility: "PUBLIC" as const },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      authorType: true,
      authorSnapshot: true,
      body: true,
      createdAt: true,
      attachments: { select: publicAttachmentSelect },
    },
  },
  businessReferences: {
    select: {
      referenceType: true,
      referenceKey: true,
      displayLabel: true,
      verificationStatus: true,
      sourceSystem: true,
      entityType: true,
      externalId: true,
      snapshotFetchedAt: true,
      snapshotExpiresAt: true,
      sourceVersion: true,
      sourceEtag: true,
    },
  },
  sla: {
    select: {
      policyCode: true,
      policyVersion: true,
      enforcementMode: true,
      firstResponseState: true,
      resolutionState: true,
      firstResponseWarningLevel: true,
      resolutionWarningLevel: true,
      resolutionEscalationLevel: true,
      firstResponseDueAt: true,
      resolutionDueAt: true,
      pausedAt: true,
      resolutionCycleNumber: true,
      resolutionCycleStartedAt: true,
    },
  },
  resolutionCycles: {
    where: { outcome: "PENDING" as const },
    take: 1,
    select: { proposedAt: true, autoCloseAt: true, reminderCount: true },
  },
} satisfies Prisma.TicketInclude;

type CustomerTicketRecord = Prisma.TicketGetPayload<{
  include: typeof customerTicketInclude;
}>;

function generatePublicTicketId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const entropy = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `TK-${timestamp}-${entropy}`;
}

type CustomerTicketStatus =
  | "IN_PROGRESS"
  | "WAITING_USER"
  | "RESOLVED"
  | "CLOSED";

function customerStatus(status: TicketLifecycleStatus): CustomerTicketStatus {
  if (status === "WAITING_USER") return "WAITING_USER";
  if (status === "RESOLVED") return "RESOLVED";
  if (status === "CLOSED" || status === "CLOSED_LEGACY") return "CLOSED";
  return "IN_PROGRESS";
}

function customerStatusFilter(
  status: TicketListV2Query["status"]
): Prisma.EnumTicketLifecycleStatusNullableFilter | TicketLifecycleStatus {
  if (!status) return { not: null };
  if (status === "IN_PROGRESS") {
    return {
      in: [
        "NEW",
        "UNASSIGNED",
        "IN_PROGRESS",
        "INTERNAL_REFERRAL",
        "WAITING_INTERNAL",
        "REOPENED",
      ],
    };
  }
  if (status === "CLOSED") return { in: ["CLOSED", "CLOSED_LEGACY"] };
  return status;
}

function toCustomerTicketDto(ticket: CustomerTicketRecord) {
  if (
    !ticket.lifecycleStatus ||
    !ticket.priority ||
    !ticket.requestType
  ) {
    throw notFoundError("تیکت یافت نشد");
  }

  return {
    ticketId: ticket.ticketId,
    subject: ticket.subject,
    status: customerStatus(ticket.lifecycleStatus),
    priority: ticket.priority,
    version: ticket.version,
    rating: ticket.rating,
    resolutionSummary: ticket.resolutionSummary,
    requestType: ticket.requestType,
    organization: ticket.organization,
    businessReferences: ticket.businessReferences.map((reference) => ({
      ...reference,
      snapshotFetchedAt:
        reference.snapshotFetchedAt?.toISOString() ?? null,
      snapshotExpiresAt:
        reference.snapshotExpiresAt?.toISOString() ?? null,
    })),
    sla: toPublicSlaDto(ticket.sla),
    resolutionConfirmation: ticket.resolutionCycles[0]
      ? {
          proposedAt: ticket.resolutionCycles[0].proposedAt.toISOString(),
          autoCloseAt: ticket.resolutionCycles[0].autoCloseAt.toISOString(),
          reminderCount: ticket.resolutionCycles[0].reminderCount,
        }
      : null,
    messages: ticket.messages.map((message) => ({
      id: message.id.toString(),
      authorType: message.authorType,
      authorLabel: message.authorSnapshot,
      body: message.body,
      attachments: message.attachments.map(toAttachmentDto),
      createdAt: message.createdAt.toISOString(),
    })),
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    closedAt: ticket.closedAt?.toISOString() ?? null,
  };
}

async function getActiveContext(user: CurrentUser): Promise<PartyContextDto> {
  const snapshot = await getPartyContextSnapshot(user);
  const context = snapshot.contexts.find(
    (candidate) => candidate.partyId === snapshot.activePartyId
  );
  if (!context) throw notFoundError("طرف حساب فعال یافت نشد");
  return context;
}

function organizationScopeWhere(
  context: PartyContextDto,
  actorUserId: number
): Prisma.TicketWhereInput {
  if (!context.organization) return { partyId: context.partyId };
  const hasOrganizationScope = context.organization.scopes.some(
    (scope) => scope.type === "ORGANIZATION" && scope.scopeKey === "*"
  );
  if (hasOrganizationScope) return { partyId: context.partyId };

  const scopedReferences = context.organization.scopes.map((scope) => ({
    referenceType: scope.type,
    referenceKey: scope.scopeKey,
  }));
  return {
    partyId: context.partyId,
    OR: [
      { createdById: actorUserId },
      ...(scopedReferences.length > 0
        ? [{ businessReferences: { some: { OR: scopedReferences } } }]
        : []),
    ],
  };
}

function scopedTicketWhere(
  context: PartyContextDto,
  actorUserId: number,
  condition: Prisma.TicketWhereInput
): Prisma.TicketWhereInput {
  return {
    AND: [organizationScopeWhere(context, actorUserId), condition],
  };
}

async function verifyContext(
  transaction: Prisma.TransactionClient,
  user: CurrentUser,
  context: PartyContextDto
): Promise<void> {
  const now = new Date();
  const session = await transaction.session.findFirst({
    where: {
      id: user.sessionId,
      userId: user.id,
      activePartyId: context.partyId,
      revokedAt: null,
      expiresAt: { gt: now },
      absoluteExpiresAt: { gt: now },
    },
    select: { id: true },
  });
  if (!session) throw notFoundError("نشست یا طرف حساب فعال معتبر نیست");

  if (context.organization) {
    const membership = await transaction.organizationMembership.findFirst({
      where: {
        id: context.organization.membershipId,
        organizationId: context.organization.id,
        userId: user.id,
        status: "ACTIVE",
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gt: now } }],
      },
      select: { id: true },
    });
    if (!membership) throw notFoundError("دسترسی سازمانی معتبر نیست");
  }
}

async function resolveBusinessReferences(
  transaction: Prisma.TransactionClient,
  input: CreateTicketV2Input,
  context: PartyContextDto,
  requestType: {
    requiresBusinessSubject: boolean;
    businessSubjectType: string | null;
  },
  actorUserId: number,
  preparedExternalReferences: PreparedExternalReferences | null
) {
  if (!requestType.requiresBusinessSubject) {
    if (input.businessReferences.length > 0) {
      throw new TicketCommandError(
        "این نوع درخواست مرجع کسب‌وکار نمی‌پذیرد",
        "BUSINESS_RULE_VIOLATION",
        422
      );
    }
    return [];
  }

  if (
    requestType.businessSubjectType === "ORGANIZATION_MEMBERSHIP" &&
    context.organization
  ) {
    return [
      {
        organizationId: context.organization.id,
        referenceType: "ORGANIZATION",
        referenceKey: String(context.organization.id),
        displayLabel: context.organization.legalName,
        verificationStatus: "VERIFIED" as const,
        sourceSystem: "TICKETING_LOCAL",
        entityType: "ORGANIZATION",
        externalId: String(context.organization.id),
        snapshotFetchedAt: new Date(),
      },
    ];
  }

  if (requestType.businessSubjectType === "RELATED_TICKET") {
    const reference = input.businessReferences.find(
      (candidate) => candidate.type === "RELATED_TICKET"
    );
    if (!reference || input.businessReferences.length !== 1) {
      throw new TicketCommandError(
        "انتخاب یک تیکت مرتبط الزامی است",
        "BUSINESS_RULE_VIOLATION",
        422
      );
    }
    const relatedTicket = await transaction.ticket.findFirst({
      where: scopedTicketWhere(context, actorUserId, {
        ticketId: reference.key,
      }),
      select: { id: true, ticketId: true, subject: true },
    });
    if (!relatedTicket) throw notFoundError("تیکت مرتبط یافت نشد");
    return [
      {
        organizationId: context.organization?.id ?? null,
        referenceType: "RELATED_TICKET",
        referenceKey: relatedTicket.ticketId,
        displayLabel: `${relatedTicket.ticketId} — ${relatedTicket.subject}`,
        verificationStatus: "VERIFIED" as const,
        sourceSystem: "TICKETING_LOCAL",
        entityType: "RELATED_TICKET",
        externalId: relatedTicket.ticketId,
        snapshotFetchedAt: new Date(),
      },
    ];
  }

  if (isExternalBusinessSubjectType(requestType.businessSubjectType)) {
    if (
      !preparedExternalReferences ||
      preparedExternalReferences.subjectType !== requestType.businessSubjectType ||
      preparedExternalReferences.requestTypeId !== input.requestTypeId
    ) {
      throw new TicketCommandError(
        "اعتبارسنجی مرجع کسب‌وکار منقضی یا ناسازگار است",
        "BUSINESS_RULE_VIOLATION",
        422
      );
    }
    const expected = input.businessReferences
      .map((reference) => `${reference.type}:${reference.key}`)
      .sort();
    const verified = preparedExternalReferences.references
      .map((reference) => `${reference.entityType}:${reference.externalId}`)
      .sort();
    if (
      expected.length !== verified.length ||
      expected.some((value, index) => value !== verified[index]) ||
      preparedExternalReferences.references.some(
        (reference) =>
          reference.snapshotExpiresAt && reference.snapshotExpiresAt <= new Date()
      )
    ) {
      throw new TicketCommandError(
        "مرجع کسب‌وکار تأییدشده با درخواست فعلی سازگار نیست",
        "BUSINESS_RULE_VIOLATION",
        422
      );
    }
    return preparedExternalReferences.references.map((reference) => ({
      organizationId: context.organization?.id ?? null,
      referenceType: reference.entityType,
      referenceKey: reference.externalId,
      displayLabel: reference.displayLabel,
      verificationStatus: "VERIFIED" as const,
      sourceSystem: reference.sourceSystem,
      entityType: reference.entityType,
      externalId: reference.externalId,
      snapshotFetchedAt: reference.snapshotFetchedAt,
      snapshotExpiresAt: reference.snapshotExpiresAt,
      sourceVersion: reference.sourceVersion,
      sourceEtag: reference.sourceEtag,
    }));
  }

  throw new TicketCommandError(
    "سرویس اعتبارسنجی موضوع کسب‌وکار هنوز در دسترس نیست",
    "DEPENDENCY_UNAVAILABLE",
    503
  );
}

async function createTicketInTransaction(
  transaction: Prisma.TransactionClient,
  user: CurrentUser,
  context: PartyContextDto,
  input: CreateTicketV2Input,
  preparedExternalReferences: PreparedExternalReferences | null
) {
  await verifyContext(transaction, user, context);
  const now = new Date();
  const requestType = await transaction.supportRequestType.findFirst({
    where: {
      id: input.requestTypeId,
      status: "ACTIVE",
      routes: {
        some: {
          status: "ACTIVE",
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          slaPolicy: {
            is: {
              status: "ACTIVE",
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            },
          },
        },
      },
    },
    include: {
      routes: {
        where: {
          status: "ACTIVE",
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        take: 2,
        include: {
          queue: { include: { team: true } },
          slaPolicy: { include: slaPolicyInclude },
        },
      },
    },
  });
  if (!requestType || requestType.routes.length !== 1) {
    throw notFoundError("نوع درخواست یا مسیر فعال آن یافت نشد");
  }
  const route = requestType.routes[0];
  if (route.queue.status !== "ACTIVE" || route.queue.team.status !== "ACTIVE") {
    throw notFoundError("صف فعال یافت نشد");
  }
  if (!route.slaPolicy) {
    throw new Error("R5 active route has no SLA policy");
  }

  const activeIncident = await transaction.supportIncident.findFirst({
    where: {
      requestTypeId: requestType.id,
      status: { in: ["DETECTED", "INVESTIGATING", "MITIGATED"] },
      impacts: { some: { partyId: context.partyId } },
    },
    select: { incidentKey: true, title: true },
    orderBy: { detectedAt: "desc" },
  });
  if (activeIncident) {
    throw new TicketCommandError(
      `این مشکل با رخداد عمومی «${activeIncident.title}» (${activeIncident.incidentKey}) در حال پیگیری است؛ برای جلوگیری از تیکت تکراری، اطلاعیه مرکز پشتیبانی را دنبال کنید.`,
      "ACTIVE_INCIDENT",
      409
    );
  }

  const references = await resolveBusinessReferences(
    transaction,
    input,
    context,
    requestType,
    user.id,
    preparedExternalReferences
  );
  const contractReference = references.find(
    (reference) => reference.referenceType === "CONTRACT"
  );
  const servicePlan = context.organization && contractReference
    ? await transaction.organizationServicePlan.findFirst({
        where: {
          organizationId: context.organization.id,
          contractReferenceKey: contractReference.referenceKey,
          status: "ACTIVE",
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gt: now } }],
          AND: [{ OR: [{ requestTypeId: requestType.id }, { requestTypeId: null }] }],
        },
        orderBy: { requestTypeId: "desc" },
      })
    : null;
  if (context.organization && contractReference && !servicePlan) {
    throw new TicketCommandError(
      "سطح خدمت فعال برای قرارداد انتخاب‌شده تعریف نشده است",
      "BUSINESS_RULE_VIOLATION",
      422
    );
  }
  const legacyIntake = await transaction.subDepartment.findFirst({
    where: {
      internalOnly: true,
      department: { internalOnly: true },
    },
    select: { id: true, departmentId: true },
  });
  if (!legacyIntake) throw new Error("R4 internal intake is not configured");
  const ownerUserId = await requireInitialTicketOwner(
    transaction,
    route.queue.teamId,
    now,
  );

  const ticket = await transaction.ticket.create({
    data: {
      ticketId: generatePublicTicketId(),
      subject: input.subject,
      message: input.description,
      status: "OPEN",
      lifecycleStatus: "NEW",
      priority: route.defaultPriority,
      routeVersion: route.version,
      userName: context.displayName,
      departmentId: legacyIntake.departmentId,
      subDepartmentId: legacyIntake.id,
      userId: user.id,
      createdById: user.id,
      partyId: context.partyId,
      organizationId: context.organization?.id ?? null,
      requestTypeId: requestType.id,
      supportTeamId: route.queue.teamId,
      queueId: route.queueId,
      ownerUserId,
      servicePlanId: servicePlan?.id ?? null,
      messages: {
        create: {
          visibility: "PUBLIC",
          authorType: "CUSTOMER",
          actorUserId: user.id,
          authorPartyId: context.partyId,
          authorSnapshot: context.displayName,
          body: input.description,
        },
      },
      ...(references.length > 0
        ? { businessReferences: { create: references } }
        : {}),
    },
    include: customerTicketInclude,
  });

  if (input.supportJourneyId) {
    await linkSupportJourneyToTicket(transaction, {
      journeyId: input.supportJourneyId,
      partyId: context.partyId,
      ticketId: ticket.id,
      requestTypeId: requestType.id,
      now: ticket.createdAt,
    });
  }

  await transaction.ticketAssignment.create({
    data: {
      ticketId: ticket.id,
      supportTeamId: route.queue.teamId,
      queueId: route.queueId,
      ownerUserId,
      activeKey: String(ticket.id),
      reason: "مسیریابی از نسخه فعال کاتالوگ",
    },
  });
  await recordRoutingDecision(transaction, {
    ticketId: ticket.id,
    routeId: route.id,
    requestTypeId: requestType.id,
    supportTeamId: route.queue.teamId,
    queueId: route.queueId,
    slaPolicyId: route.slaPolicy.id,
    actorUserId: user.id,
    source: "CATALOG",
    routeVersion: route.version,
    priority: route.defaultPriority,
    reason: "مسیریابی از نسخه فعال کاتالوگ",
  });
  const ticketSla = await createTicketSlaSnapshot(transaction, {
    ticketInternalId: ticket.id,
    ticketPublicId: ticket.ticketId,
    startedAt: ticket.createdAt,
    legacyImported: false,
    policy: route.slaPolicy,
    actorUserId: user.id,
    actorType: "USER",
    sourceType: "HUMAN",
    deferStartedEvent: true,
    ...(servicePlan
      ? {
          targetOverride: {
            firstResponseMinutes: servicePlan.firstResponseMinutes,
            resolutionMinutes: servicePlan.resolutionMinutes,
          },
        }
      : {}),
  });
  await appendTicketEvent(transaction, {
    ticketInternalId: ticket.id,
    ticketPublicId: ticket.ticketId,
    type: "ticket.created.v1",
    actorType: "USER",
    sourceType: "HUMAN",
    visibility: "PUBLIC",
    toStatus: "NEW",
    actorUserId: user.id,
    metadata: {
      requestTypeCode: requestType.code,
      routeVersion: route.version,
    },
  });
  await appendTicketSlaStartedEvent(transaction, {
    ticketInternalId: ticket.id,
    ticketPublicId: ticket.ticketId,
    startedAt: ticket.createdAt,
    legacyImported: false,
    policy: route.slaPolicy,
    actorUserId: user.id,
    actorType: "USER",
    sourceType: "HUMAN",
  }, ticketSla.enforcementMode);
  await appendTicketEvent(transaction, {
    ticketInternalId: ticket.id,
    ticketPublicId: ticket.ticketId,
    type: "ticket.routed.v1",
    actorType: "USER",
    sourceType: "HUMAN",
    visibility: "INTERNAL",
    fromStatus: "NEW",
    toStatus: "NEW",
    actorUserId: user.id,
    metadata: {
      requestTypeId: requestType.id,
      supportTeamId: route.queue.teamId,
      queueId: route.queueId,
      routeVersion: route.version,
      priority: route.defaultPriority,
    },
  });
  await appendTicketEvent(transaction, {
    ticketInternalId: ticket.id,
    ticketPublicId: ticket.ticketId,
    type: "ticket.assigned.v1",
    actorType: "SYSTEM",
    sourceType: "AUTOMATION",
    visibility: "INTERNAL",
    fromStatus: "NEW",
    toStatus: "NEW",
    reason: "تخصیص خودکار مالک اصلی هنگام مسیریابی",
    metadata: { ownerUserId },
  });
  for (const reference of references) {
    await appendTicketEvent(transaction, {
      ticketInternalId: ticket.id,
      ticketPublicId: ticket.ticketId,
      type: "ticket.business_reference_linked.v1",
      actorType: "USER",
      sourceType: "HUMAN",
      visibility: "INTERNAL",
      fromStatus: "NEW",
      toStatus: "NEW",
      actorUserId: user.id,
      metadata: { referenceType: reference.referenceType },
    });
  }

  if (input.attachments.length > 0) {
    const initialMessage = ticket.messages[0];
    if (!initialMessage) throw new Error("Initial ticket message was not created");
    await claimPendingUploads(transaction, input.attachments, user.id, {
      kind: "message",
      ticketId: ticket.id,
      messageId: initialMessage.id,
    });
  }

  await transaction.notification.create({
    data: {
      ticketId: ticket.id,
      recipientType: "ADMIN",
      message: `تیکت جدید ${ticket.ticketId} ثبت شد`,
    },
  });
  await transaction.notification.create({
    data: {
      ticketId: ticket.id,
      userId: user.id,
      recipientType: "USER",
      message: `تیکت ${ticket.ticketId} با موفقیت ثبت شد`,
    },
  });

  const saved = await transaction.ticket.findUnique({
    where: { id: ticket.id },
    include: customerTicketInclude,
  });
  if (!saved) throw notFoundError("تیکت یافت نشد");
  return { ticket: saved, dto: toCustomerTicketDto(saved) };
}

async function prepareExternalBusinessReferences(input: {
  command: CreateTicketV2Input;
  context: PartyContextDto;
  requestId: string;
}): Promise<PreparedExternalReferences | null> {
  const requestType = await prisma.supportRequestType.findFirst({
    where: { id: input.command.requestTypeId, status: "ACTIVE" },
    select: {
      id: true,
      requiresBusinessSubject: true,
      businessSubjectType: true,
    },
  });
  if (
    !requestType ||
    !requestType.requiresBusinessSubject ||
    !isExternalBusinessSubjectType(requestType.businessSubjectType)
  ) {
    return null;
  }

  if (
    input.command.businessReferences.length === 0 ||
    input.command.businessReferences.some(
      (reference) => reference.type !== requestType.businessSubjectType
    )
  ) {
    throw new TicketCommandError(
      "انتخاب مرجع معتبر برای موضوع کسب‌وکار الزامی است",
      "BUSINESS_RULE_VIOLATION",
      422
    );
  }

  try {
    const references = await verifyBusinessReferences({
      context: input.context,
      subjectType: requestType.businessSubjectType,
      externalIds: input.command.businessReferences.map(
        (reference) => reference.key
      ),
      requestId: input.requestId,
    });
    return {
      requestTypeId: requestType.id,
      subjectType: requestType.businessSubjectType,
      references,
    };
  } catch (error) {
    if (!isBusinessReferenceError(error)) throw error;
    if (error.status === 404) {
      throw new TicketCommandError(
        error.message,
        "BUSINESS_RULE_VIOLATION",
        422
      );
    }
    throw new TicketCommandError(error.message, error.code, error.status);
  }
}

async function replayCustomerTicketReceipt(input: {
  user: CurrentUser;
  context: PartyContextDto;
  keyHash: string;
  payloadHash: string;
  now: Date;
}) {
  const receipt = await prisma.ticketCommandReceipt.findUnique({
    where: {
      actorUserId_partyId_route_keyHash: {
        actorUserId: input.user.id,
        partyId: input.context.partyId,
        route: CREATE_TICKET_ROUTE,
        keyHash: input.keyHash,
      },
    },
    select: {
      payloadHash: true,
      status: true,
      ticketId: true,
      expiresAt: true,
    },
  });
  if (!receipt || receipt.expiresAt <= input.now) return null;
  if (receipt.payloadHash !== input.payloadHash) {
    throw new TicketCommandError(
      "کلید تکرار با محتوای متفاوت استفاده شده است",
      "IDEMPOTENCY_KEY_REUSED",
      409
    );
  }
  if (receipt.status !== "SUCCEEDED" || !receipt.ticketId) {
    throw new TicketCommandError(
      "درخواست قبلی هنوز در حال پردازش است",
      "IDEMPOTENCY_IN_PROGRESS",
      409
    );
  }
  const ticket = await prisma.ticket.findFirst({
    where: scopedTicketWhere(input.context, input.user.id, {
      id: receipt.ticketId,
    }),
    include: customerTicketInclude,
  });
  if (!ticket) throw notFoundError("تیکت یافت نشد");
  return { ticket: toCustomerTicketDto(ticket), replayed: true };
}

export async function createCustomerTicket(input: {
  user: CurrentUser;
  command: CreateTicketV2Input;
  idempotencyKey: string;
  requestId: string;
}) {
  const context = await getActiveContext(input.user);
  const keyHash = hashSecurityValue("ticket-command-key", input.idempotencyKey);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(input.command))
    .digest("hex");
  const now = new Date();

  const replay = await replayCustomerTicketReceipt({
    user: input.user,
    context,
    keyHash,
    payloadHash,
    now,
  });
  if (replay) return replay;

  const preparedExternalReferences = await prepareExternalBusinessReferences({
    command: input.command,
    context,
    requestId: input.requestId,
  });

  try {
    return await runSerializableTransaction(async (transaction) => {
      await transaction.ticketCommandReceipt.deleteMany({
        where: {
          actorUserId: input.user.id,
          partyId: context.partyId,
          route: CREATE_TICKET_ROUTE,
          keyHash,
          expiresAt: { lte: now },
        },
      });
      const receipt = await transaction.ticketCommandReceipt.create({
        data: {
          actorUserId: input.user.id,
          partyId: context.partyId,
          route: CREATE_TICKET_ROUTE,
          keyHash,
          payloadHash,
          expiresAt: new Date(now.getTime() + RECEIPT_TTL_MS),
        },
      });
      const created = await createTicketInTransaction(
        transaction,
        input.user,
        context,
        input.command,
        preparedExternalReferences
      );
      await transaction.ticketCommandReceipt.update({
        where: { id: receipt.id },
        data: {
          ticketId: created.ticket.id,
          status: "SUCCEEDED",
          responseStatus: 201,
          responseBody: JSON.parse(JSON.stringify(created.dto)),
        },
      });
      return { ticket: created.dto, replayed: false };
    });
  } catch (error) {
    if (getPersistenceErrorCode(error) !== "P2002") throw error;
    const racedReplay = await replayCustomerTicketReceipt({
      user: input.user,
      context,
      keyHash,
      payloadHash,
      now: new Date(),
    });
    if (!racedReplay) throw error;
    return racedReplay;
  }
}

export async function listCustomerTickets(input: {
  user: CurrentUser;
  query: TicketListV2Query;
}) {
  const context = await getActiveContext(input.user);
  const cursor = input.query.cursor
    ? decodeTicketCursor(input.query.cursor)
    : null;
  const where = scopedTicketWhere(context, input.user.id, {
    AND: [
      { lifecycleStatus: customerStatusFilter(input.query.status) },
      ...(cursor
        ? [
            {
              OR: [
                { updatedAt: { lt: cursor.updatedAt } },
                { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
              ],
            },
          ]
        : []),
    ],
  });
  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: input.query.limit + 1,
    select: {
      id: true,
      ticketId: true,
      subject: true,
      lifecycleStatus: true,
      priority: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      requestType: {
        select: {
          code: true,
          name: true,
          service: { select: { code: true, name: true } },
        },
      },
    },
  });
  const hasMore = tickets.length > input.query.limit;
  const page = tickets.slice(0, input.query.limit);
  const last = page.at(-1);
  return {
    tickets: page.map((ticket) => ({
      ticketId: ticket.ticketId,
      subject: ticket.subject,
      status: ticket.lifecycleStatus
        ? customerStatus(ticket.lifecycleStatus)
        : "IN_PROGRESS",
      priority: ticket.priority,
      version: ticket.version,
      requestType: ticket.requestType,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    })),
    page: {
      nextCursor:
        hasMore && last
          ? encodeTicketCursor({
              updatedAt: last.updatedAt.toISOString(),
              id: last.id,
            })
          : null,
      hasMore,
      limit: input.query.limit,
    },
  };
}

export async function getCustomerTicket(input: {
  user: CurrentUser;
  ticketId: string;
}) {
  const context = await getActiveContext(input.user);
  const ticket = await prisma.ticket.findFirst({
    where: scopedTicketWhere(context, input.user.id, {
      ticketId: input.ticketId,
    }),
    include: customerTicketInclude,
  });
  if (!ticket) throw notFoundError("تیکت یافت نشد");
  return toCustomerTicketDto(ticket);
}

function timelineMessageWhere(cursor: TicketTimelineCursor | null) {
  if (!cursor) return {};
  return cursor.kind === "EVENT"
    ? { createdAt: { lte: cursor.createdAt } }
    : {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      };
}

function timelineEventWhere(cursor: TicketTimelineCursor | null) {
  if (!cursor) return {};
  return cursor.kind === "MESSAGE"
    ? { createdAt: { lt: cursor.createdAt } }
    : {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      };
}

export async function getCustomerTicketTimeline(input: {
  user: CurrentUser;
  ticketId: string;
  query: TicketTimelineV2Query;
}) {
  const context = await getActiveContext(input.user);
  const ticket = await prisma.ticket.findFirst({
    where: scopedTicketWhere(context, input.user.id, {
      ticketId: input.ticketId,
    }),
    select: { id: true },
  });
  if (!ticket) throw notFoundError("تیکت یافت نشد");
  const cursor = input.query.cursor
    ? decodeTicketTimelineCursor(input.query.cursor)
    : null;
  const take = input.query.limit + 1;
  const [messages, events] = await Promise.all([
    prisma.ticketMessage.findMany({
      where: {
        ticketId: ticket.id,
        visibility: "PUBLIC",
        ...timelineMessageWhere(cursor),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        authorType: true,
        authorSnapshot: true,
        body: true,
        createdAt: true,
        attachments: { select: publicAttachmentSelect },
      },
    }),
    prisma.ticketEvent.findMany({
      where: {
        ticketId: ticket.id,
        visibility: "PUBLIC",
        ...timelineEventWhere(cursor),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        type: true,
        fromStatus: true,
        toStatus: true,
        reason: true,
        createdAt: true,
      },
    }),
  ]);
  const merged = [
    ...messages.map((message) => ({
      kind: "MESSAGE" as const,
      id: message.id,
      createdAt: message.createdAt,
      value: {
        kind: "MESSAGE" as const,
        id: message.id.toString(),
        authorType: message.authorType,
        authorLabel: message.authorSnapshot,
        body: message.body,
        attachments: message.attachments.map(toAttachmentDto),
        createdAt: message.createdAt.toISOString(),
      },
    })),
    ...events.map((event) => ({
      kind: "EVENT" as const,
      id: event.id,
      createdAt: event.createdAt,
      value: {
        kind: "EVENT" as const,
        id: event.id.toString(),
        type: event.type,
        fromStatus: event.fromStatus
          ? customerStatus(event.fromStatus)
          : null,
        toStatus: event.toStatus ? customerStatus(event.toStatus) : null,
        reason: event.reason,
        createdAt: event.createdAt.toISOString(),
      },
    })),
  ].sort((left, right) => {
    const byDate = right.createdAt.getTime() - left.createdAt.getTime();
    if (byDate !== 0) return byDate;
    if (left.kind !== right.kind) return left.kind === "EVENT" ? -1 : 1;
    return left.id > right.id ? -1 : left.id < right.id ? 1 : 0;
  });
  const hasMore = merged.length > input.query.limit;
  const page = merged.slice(0, input.query.limit);
  const last = page.at(-1);
  return {
    items: page.map((item) => item.value),
    page: {
      nextCursor:
        hasMore && last
          ? encodeTicketTimelineCursor({
              createdAt: last.createdAt,
              kind: last.kind,
              id: last.id,
            })
          : null,
      hasMore,
      limit: input.query.limit,
    },
  };
}

export type CustomerTicketTransition =
  | "CONFIRM_RESOLUTION"
  | "REJECT_RESOLUTION"
  | "REOPEN";

const customerTransitionDefinition: Record<
  CustomerTicketTransition,
  {
    routeSuffix: string;
    target: TicketLifecycleStatus;
    eventType: TicketDomainEventType;
  }
> = {
  CONFIRM_RESOLUTION: {
    routeSuffix: "confirm-resolution",
    target: "CLOSED",
    eventType: "ticket.resolution_confirmed.v1",
  },
  REJECT_RESOLUTION: {
    routeSuffix: "reject-resolution",
    target: "REOPENED",
    eventType: "ticket.resolution_rejected.v1",
  },
  REOPEN: {
    routeSuffix: "reopen",
    target: "REOPENED",
    eventType: "ticket.reopened.v1",
  },
};

export async function transitionCustomerTicket(input: {
  user: CurrentUser;
  ticketId: string;
  transition: CustomerTicketTransition;
  reason?: string;
  idempotencyKey: string;
  ifMatch: string | null;
}) {
  const context = await getActiveContext(input.user);
  const definition = customerTransitionDefinition[input.transition];
  const route = `POST /api/v2/tickets/:ticketId/${definition.routeSuffix}`;
  const keyHash = hashSecurityValue("ticket-command-key", input.idempotencyKey);
  const payloadHash = createHash("sha256")
    .update(
      JSON.stringify({
        ticketId: input.ticketId,
        transition: input.transition,
        reason: input.reason ?? null,
      })
    )
    .digest("hex");
  const now = new Date();

  try {
    return await runSerializableTransaction(async (transaction) => {
      await verifyContext(transaction, input.user, context);
      await transaction.ticketCommandReceipt.deleteMany({
        where: {
          actorUserId: input.user.id,
          partyId: context.partyId,
          route,
          keyHash,
          expiresAt: { lte: now },
        },
      });
      const receipt = await transaction.ticketCommandReceipt.create({
        data: {
          actorUserId: input.user.id,
          partyId: context.partyId,
          route,
          keyHash,
          payloadHash,
          expiresAt: new Date(now.getTime() + RECEIPT_TTL_MS),
        },
      });
      const ticket = await transaction.ticket.findFirst({
        where: scopedTicketWhere(context, input.user.id, {
          ticketId: input.ticketId,
        }),
        select: {
          id: true,
          ticketId: true,
          lifecycleStatus: true,
          version: true,
          closedAt: true,
          updatedAt: true,
        },
      });
      if (!ticket?.lifecycleStatus) throw notFoundError("تیکت یافت نشد");
      requireExpectedTicketVersion(
        ticket.ticketId,
        ticket.version,
        input.ifMatch
      );
      if (
        !canTransitionTicket(
          ticket.lifecycleStatus,
          definition.target,
          "CUSTOMER"
        )
      ) {
        throw new TicketCommandError(
          "تغییر وضعیت در وضعیت فعلی مجاز نیست",
          "INVALID_TRANSITION",
          409
        );
      }
      if (
        input.transition === "REOPEN" &&
        (!ticket.closedAt ||
          ticket.closedAt < new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
      ) {
        throw new TicketCommandError(
          "مهلت هفت‌روزه بازگشایی پایان یافته است",
          "BUSINESS_RULE_VIOLATION",
          422
        );
      }

      const updated = await transaction.ticket.updateMany({
        where: {
          id: ticket.id,
          version: ticket.version,
          lifecycleStatus: ticket.lifecycleStatus,
        },
        data: {
          lifecycleStatus: definition.target,
          status:
            definition.target === "CLOSED" ? "CLOSED" : "IN_PROGRESS",
          version: { increment: 1 },
          ...(definition.target === "CLOSED"
            ? {
                closedAt: now,
                closedBy: "USER",
                closedReason: "تأیید نتیجه توسط کاربر",
              }
            : { closedAt: null, closedBy: null, closedReason: null }),
        },
      });
      if (updated.count !== 1) {
        throw new TicketCommandError(
          "تیکت هم‌زمان تغییر کرده است؛ اطلاعات را تازه‌سازی کنید",
          "CONCURRENT_MODIFICATION",
          409
        );
      }
      if (input.transition === "CONFIRM_RESOLUTION") {
        await markTicketResolved(transaction, ticket.id, ticket.updatedAt);
        await finishActiveResolutionCycle(transaction, ticket.id, "CONFIRMED", now);
      } else if (input.transition === "REJECT_RESOLUTION") {
        await finishActiveResolutionCycle(transaction, ticket.id, "REJECTED");
      }
      if (
        input.transition === "REJECT_RESOLUTION" ||
        input.transition === "REOPEN"
      ) {
        await restartTicketResolutionSla(transaction, {
          ticketId: ticket.id,
          ticketPublicId: ticket.ticketId,
          occurredAt: now,
          actorUserId: input.user.id,
          reason:
            input.transition === "REJECT_RESOLUTION"
              ? "RESOLUTION_REJECTED"
              : "TICKET_REOPENED",
        });
      }
      await appendTicketEvent(transaction, {
        ticketInternalId: ticket.id,
        ticketPublicId: ticket.ticketId,
        type: definition.eventType,
        actorType: "USER",
        sourceType: "HUMAN",
        visibility: "PUBLIC",
        fromStatus: ticket.lifecycleStatus,
        toStatus: definition.target,
        actorUserId: input.user.id,
        reason: input.reason ?? null,
        metadata: { source: "customer-api-v2" },
      });
      if (input.transition === "REJECT_RESOLUTION") {
        await appendTicketEvent(transaction, {
          ticketInternalId: ticket.id,
          ticketPublicId: ticket.ticketId,
          type: "ticket.reopened.v1",
          actorType: "USER",
          sourceType: "HUMAN",
          visibility: "PUBLIC",
          fromStatus: ticket.lifecycleStatus,
          toStatus: "REOPENED",
          actorUserId: input.user.id,
          reason: input.reason,
          metadata: { source: "resolution-rejection" },
        });
      }
      if (input.transition === "CONFIRM_RESOLUTION") {
        await appendTicketEvent(transaction, {
          ticketInternalId: ticket.id,
          ticketPublicId: ticket.ticketId,
          type: "ticket.closed.v1",
          actorType: "USER",
          sourceType: "HUMAN",
          visibility: "PUBLIC",
          fromStatus: ticket.lifecycleStatus,
          toStatus: "CLOSED",
          actorUserId: input.user.id,
          metadata: { source: "resolution-confirmation" },
        });
      }
      await transaction.notification.create({
        data: {
          ticketId: ticket.id,
          recipientType: "ADMIN",
          message: `وضعیت تیکت ${ticket.ticketId} توسط کاربر تغییر کرد`,
        },
      });

      const saved = await transaction.ticket.findUnique({
        where: { id: ticket.id },
        include: customerTicketInclude,
      });
      if (!saved) throw notFoundError("تیکت یافت نشد");
      const dto = toCustomerTicketDto(saved);
      await transaction.ticketCommandReceipt.update({
        where: { id: receipt.id },
        data: {
          ticketId: ticket.id,
          status: "SUCCEEDED",
          responseStatus: 200,
          responseBody: JSON.parse(JSON.stringify(dto)),
        },
      });
      return { ticket: dto, replayed: false };
    });
  } catch (error) {
    if (getPersistenceErrorCode(error) !== "P2002") throw error;
    const receipt = await prisma.ticketCommandReceipt.findUnique({
      where: {
        actorUserId_partyId_route_keyHash: {
          actorUserId: input.user.id,
          partyId: context.partyId,
          route,
          keyHash,
        },
      },
      select: { payloadHash: true, status: true, ticketId: true },
    });
    if (!receipt) throw error;
    if (receipt.payloadHash !== payloadHash) {
      throw new TicketCommandError(
        "کلید تکرار با محتوای متفاوت استفاده شده است",
        "IDEMPOTENCY_KEY_REUSED",
        409
      );
    }
    if (receipt.status !== "SUCCEEDED" || !receipt.ticketId) {
      throw new TicketCommandError(
        "درخواست قبلی هنوز در حال پردازش است",
        "IDEMPOTENCY_IN_PROGRESS",
        409
      );
    }
    const saved = await prisma.ticket.findFirst({
      where: scopedTicketWhere(context, input.user.id, {
        id: receipt.ticketId,
      }),
      include: customerTicketInclude,
    });
    if (!saved) throw notFoundError("تیکت یافت نشد");
    return { ticket: toCustomerTicketDto(saved), replayed: true };
  }
}

export async function addCustomerTicketMessage(input: {
  user: CurrentUser;
  ticketId: string;
  command: AddTicketMessageInput;
  idempotencyKey: string;
  ifMatch: string | null;
}) {
  const context = await getActiveContext(input.user);
  const route = "POST /api/v2/tickets/:ticketId/messages";
  const keyHash = hashSecurityValue("ticket-command-key", input.idempotencyKey);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ ticketId: input.ticketId, ...input.command }))
    .digest("hex");
  const now = new Date();

  try {
    return await runSerializableTransaction(async (transaction) => {
      await verifyContext(transaction, input.user, context);
      await transaction.ticketCommandReceipt.deleteMany({
        where: {
          actorUserId: input.user.id,
          partyId: context.partyId,
          route,
          keyHash,
          expiresAt: { lte: now },
        },
      });
      const receipt = await transaction.ticketCommandReceipt.create({
        data: {
          actorUserId: input.user.id,
          partyId: context.partyId,
          route,
          keyHash,
          payloadHash,
          expiresAt: new Date(now.getTime() + RECEIPT_TTL_MS),
        },
      });
      const ticket = await transaction.ticket.findFirst({
        where: scopedTicketWhere(context, input.user.id, {
          ticketId: input.ticketId,
        }),
        select: {
          id: true,
          ticketId: true,
          lifecycleStatus: true,
          ownerUserId: true,
          version: true,
        },
      });
      if (!ticket?.lifecycleStatus) throw notFoundError("تیکت یافت نشد");
      requireExpectedTicketVersion(
        ticket.ticketId,
        ticket.version,
        input.ifMatch
      );
      if (
        ["RESOLVED", "CLOSED", "CLOSED_LEGACY"].includes(
          ticket.lifecycleStatus
        )
      ) {
        throw new TicketCommandError(
          "افزودن پیام در وضعیت فعلی مجاز نیست",
          "INVALID_TRANSITION",
          409
        );
      }
      const nextStatus: TicketLifecycleStatus =
        ticket.lifecycleStatus === "WAITING_USER"
          ? ticket.ownerUserId
            ? "IN_PROGRESS"
            : "UNASSIGNED"
          : ticket.lifecycleStatus;
      const updated = await transaction.ticket.updateMany({
        where: {
          id: ticket.id,
          version: ticket.version,
          lifecycleStatus: ticket.lifecycleStatus,
        },
        data: {
          status: "IN_PROGRESS",
          lifecycleStatus: nextStatus,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new TicketCommandError(
          "تیکت هم‌زمان تغییر کرده است؛ اطلاعات را تازه‌سازی کنید",
          "CONCURRENT_MODIFICATION",
          409
        );
      }
      const legacyReply = await transaction.ticketReply.create({
        data: {
          ticketId: ticket.id,
          senderType: "USER",
          senderName: context.displayName,
          message: input.command.message,
        },
      });
      const message = await transaction.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          visibility: "PUBLIC",
          authorType: "CUSTOMER",
          actorUserId: input.user.id,
          authorPartyId: context.partyId,
          authorSnapshot: context.displayName,
          body: input.command.message,
        },
      });
      if (input.command.attachments.length > 0) {
        await claimPendingUploads(
          transaction,
          input.command.attachments,
          input.user.id,
          {
            kind: "message",
            messageId: message.id,
            replyId: legacyReply.id,
          }
        );
      }
      await appendTicketEvent(transaction, {
        ticketInternalId: ticket.id,
        ticketPublicId: ticket.ticketId,
        type: "ticket.public_message_added.v1",
        actorType: "USER",
        sourceType: "HUMAN",
        visibility: "PUBLIC",
        fromStatus: ticket.lifecycleStatus,
        toStatus: nextStatus,
        actorUserId: input.user.id,
        metadata: { source: "customer-api-v2" },
      });
      if (ticket.lifecycleStatus === "WAITING_USER") {
        await resumeTicketResolutionSla(transaction, {
          ticketId: ticket.id,
          ticketPublicId: ticket.ticketId,
          occurredAt: now,
          actorUserId: input.user.id,
          actorType: "USER",
          sourceType: "HUMAN",
        });
        await appendTicketEvent(transaction, {
          ticketInternalId: ticket.id,
          ticketPublicId: ticket.ticketId,
          type: "ticket.customer_replied.v1",
          actorType: "USER",
          sourceType: "HUMAN",
          visibility: "INTERNAL",
          fromStatus: "WAITING_USER",
          toStatus: nextStatus,
          actorUserId: input.user.id,
        });
      }
      await transaction.notification.create({
        data: {
          ticketId: ticket.id,
          recipientType: "ADMIN",
          message: `پاسخ جدید در تیکت ${ticket.ticketId} ثبت شد`,
        },
      });
      const saved = await transaction.ticket.findUnique({
        where: { id: ticket.id },
        include: customerTicketInclude,
      });
      if (!saved) throw notFoundError("تیکت یافت نشد");
      const dto = toCustomerTicketDto(saved);
      await transaction.ticketCommandReceipt.update({
        where: { id: receipt.id },
        data: {
          ticketId: ticket.id,
          status: "SUCCEEDED",
          responseStatus: 200,
          responseBody: JSON.parse(JSON.stringify(dto)),
        },
      });
      return { ticket: dto, replayed: false };
    });
  } catch (error) {
    if (getPersistenceErrorCode(error) !== "P2002") throw error;
    return replayTicketCommand({
      actorUserId: input.user.id,
      context,
      route,
      keyHash,
      payloadHash,
      originalError: error,
    });
  }
}

async function replayTicketCommand(input: {
  actorUserId: number;
  context: PartyContextDto;
  route: string;
  keyHash: string;
  payloadHash: string;
  originalError: unknown;
}) {
  const receipt = await prisma.ticketCommandReceipt.findUnique({
    where: {
      actorUserId_partyId_route_keyHash: {
        actorUserId: input.actorUserId,
        partyId: input.context.partyId,
        route: input.route,
        keyHash: input.keyHash,
      },
    },
    select: { payloadHash: true, status: true, ticketId: true },
  });
  if (!receipt) throw input.originalError;
  if (receipt.payloadHash !== input.payloadHash) {
    throw new TicketCommandError(
      "کلید تکرار با محتوای متفاوت استفاده شده است",
      "IDEMPOTENCY_KEY_REUSED",
      409
    );
  }
  if (receipt.status !== "SUCCEEDED" || !receipt.ticketId) {
    throw new TicketCommandError(
      "درخواست قبلی هنوز در حال پردازش است",
      "IDEMPOTENCY_IN_PROGRESS",
      409
    );
  }
  const saved = await prisma.ticket.findFirst({
    where: scopedTicketWhere(input.context, input.actorUserId, {
      id: receipt.ticketId,
    }),
    include: customerTicketInclude,
  });
  if (!saved) throw notFoundError("تیکت یافت نشد");
  return { ticket: toCustomerTicketDto(saved), replayed: true };
}

export async function rateCustomerTicket(input: {
  user: CurrentUser;
  ticketId: string;
  rating: number;
  idempotencyKey: string;
  ifMatch: string | null;
}) {
  const context = await getActiveContext(input.user);
  const route = "POST /api/v2/tickets/:ticketId/rating";
  const keyHash = hashSecurityValue("ticket-command-key", input.idempotencyKey);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ ticketId: input.ticketId, rating: input.rating }))
    .digest("hex");
  const now = new Date();

  try {
    return await runSerializableTransaction(async (transaction) => {
      await verifyContext(transaction, input.user, context);
      await transaction.ticketCommandReceipt.deleteMany({
        where: {
          actorUserId: input.user.id,
          partyId: context.partyId,
          route,
          keyHash,
          expiresAt: { lte: now },
        },
      });
      const receipt = await transaction.ticketCommandReceipt.create({
        data: {
          actorUserId: input.user.id,
          partyId: context.partyId,
          route,
          keyHash,
          payloadHash,
          expiresAt: new Date(now.getTime() + RECEIPT_TTL_MS),
        },
      });
      const ticket = await transaction.ticket.findFirst({
        where: scopedTicketWhere(context, input.user.id, {
          ticketId: input.ticketId,
        }),
        select: {
          id: true,
          ticketId: true,
          lifecycleStatus: true,
          version: true,
          rating: true,
        },
      });
      if (!ticket?.lifecycleStatus) throw notFoundError("تیکت یافت نشد");
      requireExpectedTicketVersion(
        ticket.ticketId,
        ticket.version,
        input.ifMatch
      );
      if (ticket.lifecycleStatus !== "CLOSED") {
        throw new TicketCommandError(
          "امتیازدهی فقط پس از بسته‌شدن تیکت مجاز است",
          "BUSINESS_RULE_VIOLATION",
          422
        );
      }
      if (ticket.rating !== null) {
        throw new TicketCommandError(
          "امتیاز این تیکت قبلاً ثبت شده است",
          "BUSINESS_RULE_VIOLATION",
          422
        );
      }
      const updated = await transaction.ticket.updateMany({
        where: { id: ticket.id, version: ticket.version, rating: null },
        data: { rating: input.rating, version: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new TicketCommandError(
          "تیکت هم‌زمان تغییر کرده است؛ اطلاعات را تازه‌سازی کنید",
          "CONCURRENT_MODIFICATION",
          409
        );
      }
      await appendTicketEvent(transaction, {
        ticketInternalId: ticket.id,
        ticketPublicId: ticket.ticketId,
        type: "ticket.rated.v1",
        actorType: "USER",
        sourceType: "HUMAN",
        visibility: "INTERNAL",
        actorUserId: input.user.id,
        metadata: { rating: input.rating, source: "customer-api-v2" },
      });
      const saved = await transaction.ticket.findUnique({
        where: { id: ticket.id },
        include: customerTicketInclude,
      });
      if (!saved) throw notFoundError("تیکت یافت نشد");
      const dto = toCustomerTicketDto(saved);
      await transaction.ticketCommandReceipt.update({
        where: { id: receipt.id },
        data: {
          ticketId: ticket.id,
          status: "SUCCEEDED",
          responseStatus: 200,
          responseBody: JSON.parse(JSON.stringify(dto)),
        },
      });
      return { ticket: dto, replayed: false };
    });
  } catch (error) {
    if (getPersistenceErrorCode(error) !== "P2002") throw error;
    return replayTicketCommand({
      actorUserId: input.user.id,
      context,
      route,
      keyHash,
      payloadHash,
      originalError: error,
    });
  }
}

export async function deleteExpiredTicketCommandReceipts(now = new Date()) {
  return prisma.ticketCommandReceipt.deleteMany({
    where: { expiresAt: { lte: now } },
  });
}

export async function reconcileMappedLegacyTickets(limit = 100) {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
  return runSerializableTransaction(async (transaction) => {
    const now = new Date();
    const mappings = await transaction.legacySupportCatalogMapping.findMany({
      where: {
        sourceType: "SUB_DEPARTMENT",
        status: "MAPPED",
        supportRequestType: {
          status: "ACTIVE",
          service: { status: "ACTIVE" },
        },
      },
      select: {
        legacyId: true,
        supportRequestType: {
          select: {
            id: true,
            routes: {
              where: {
                status: "ACTIVE",
                effectiveFrom: { lte: now },
                OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
                queue: { status: "ACTIVE", team: { status: "ACTIVE" } },
                slaPolicy: {
                  is: {
                    status: "ACTIVE",
                    effectiveFrom: { lte: now },
                    OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
                  },
                },
              },
              take: 2,
              select: {
                id: true,
                version: true,
                defaultPriority: true,
                slaPolicyId: true,
                queue: { select: { id: true, teamId: true } },
              },
            },
          },
        },
      },
    });
    const targets = new Map(
      mappings
        .filter(
          (mapping) =>
            mapping.supportRequestType &&
            mapping.supportRequestType.routes.length === 1
        )
        .map((mapping) => [mapping.legacyId, mapping.supportRequestType!])
    );
    if (targets.size === 0) return { reconciled: 0, skipped: 0 };

    const tickets = await transaction.ticket.findMany({
      where: {
        legacyImported: true,
        subDepartmentId: { in: [...targets.keys()] },
        requestType: { code: "LEGACY_UNCLASSIFIED" },
      },
      orderBy: { id: "asc" },
      take: boundedLimit,
      select: {
        id: true,
        ticketId: true,
        version: true,
        lifecycleStatus: true,
        queueId: true,
        supportTeamId: true,
        subDepartmentId: true,
      },
    });
    let reconciled = 0;
    let skipped = 0;
    for (const ticket of tickets) {
      const requestType = targets.get(ticket.subDepartmentId);
      const route = requestType?.routes[0];
      if (!requestType || !route || !ticket.lifecycleStatus) {
        skipped += 1;
        continue;
      }
      const updated = await transaction.ticket.updateMany({
        where: {
          id: ticket.id,
          version: ticket.version,
          requestType: { code: "LEGACY_UNCLASSIFIED" },
        },
        data: {
          requestTypeId: requestType.id,
          supportTeamId: route.queue.teamId,
          queueId: route.queue.id,
          routeVersion: route.version,
          priority: route.defaultPriority,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        skipped += 1;
        continue;
      }
      await transaction.ticketAssignment.updateMany({
        where: { ticketId: ticket.id, endedAt: null },
        data: { endedAt: now, activeKey: null },
      });
      await transaction.ticketAssignment.create({
        data: {
          ticketId: ticket.id,
          supportTeamId: route.queue.teamId,
          queueId: route.queue.id,
          reason: "Reconciliation نگاشت تأییدشده legacy",
          activeKey: String(ticket.id),
        },
      });
      await recordRoutingDecision(transaction, {
        ticketId: ticket.id,
        routeId: route.id,
        requestTypeId: requestType.id,
        supportTeamId: route.queue.teamId,
        queueId: route.queue.id,
        slaPolicyId: route.slaPolicyId,
        source: "RECONCILIATION",
        routeVersion: route.version,
        priority: route.defaultPriority,
        reason: "تطبیق نگاشت صریح legacy",
      });
      await appendTicketEvent(transaction, {
        ticketInternalId: ticket.id,
        ticketPublicId: ticket.ticketId,
        type: "ticket.transferred.v1",
        actorType: "SYSTEM",
        sourceType: "MIGRATION",
        visibility: "INTERNAL",
        fromStatus: ticket.lifecycleStatus,
        toStatus: ticket.lifecycleStatus,
        metadata: {
          source: "legacy-mapping-reconciliation",
          fromQueueId: ticket.queueId,
          fromSupportTeamId: ticket.supportTeamId,
          toQueueId: route.queue.id,
          toSupportTeamId: route.queue.teamId,
          requestTypeId: requestType.id,
          routeVersion: route.version,
        },
      });
      reconciled += 1;
    }
    return { reconciled, skipped };
  });
}
