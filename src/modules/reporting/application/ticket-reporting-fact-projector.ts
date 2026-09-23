import type {
  PartyType,
  ReportingDataQualityStatus,
  ReportingFcrStatus,
  SlaTargetState,
  SupportPriority,
  TicketReportingFact,
} from "@prisma/client";
import {
  SLA_EVENT_TYPES,
  TICKET_EVENT_TYPES,
  type TicketDomainEventType,
} from "@/modules/tickets/contracts/ticket-domain-events";
import {
  isHistoricalIncompleteEvent,
  parseInternalNumericId,
  parseOptionalEventDate,
  type ReportingEventEnvelope,
} from "@/modules/reporting/contracts/reporting-event-envelope";
import { ReportingProjectionError } from "@/modules/reporting/domain/reporting-projection-error";

const FCR_WINDOW_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;
const TERMINAL_SLA_STATES = new Set<SlaTargetState>(["MET", "BREACHED"]);

export type TicketFactState = Pick<
  TicketReportingFact,
  | "sourceAggregateVersion"
  | "sourceLastEventId"
  | "ticketCreatedAt"
  | "slaStartedAt"
  | "firstResponseDueAt"
  | "resolutionDueAt"
  | "firstHumanPublicResponseAt"
  | "firstResponsePauseMilliseconds"
  | "firstResponseEffectiveMilliseconds"
  | "firstResolvedAt"
  | "resolutionPauseMilliseconds"
  | "resolutionEffectiveMilliseconds"
  | "firstClosedAt"
  | "lastClosedAt"
  | "fcrMaturesAt"
  | "fcrStatus"
  | "firstResponseSlaState"
  | "resolutionSlaState"
  | "reopenedWithinWindow"
  | "reopenCount"
  | "resolutionRejectionCount"
  | "reopenWithinWindowEventCount"
  | "customerReopenWithinWindowCount"
  | "staffReopenWithinWindowCount"
  | "systemReopenWithinWindowCount"
  | "publicStaffMessageCount"
  | "publicCustomerMessageCount"
  | "transferCount"
  | "collaborationCount"
  | "hasCustomerReplyAfterFirstResponse"
  | "rating"
  | "ratedAt"
  | "serviceId"
  | "serviceCode"
  | "serviceName"
  | "requestTypeId"
  | "requestTypeCode"
  | "requestTypeName"
  | "supportTeamId"
  | "supportTeamCode"
  | "supportTeamName"
  | "queueId"
  | "queueCode"
  | "queueName"
  | "ownerUserId"
  | "organizationId"
  | "partyType"
  | "partyKeyHash"
  | "normalizedRootCauseId"
  | "normalizedRootCauseCode"
  | "normalizedRootCauseName"
  | "incidentKey"
  | "priorityAtCreation"
  | "priorityAtResolution"
  | "channel"
  | "slaPolicyCode"
  | "slaPolicyVersion"
  | "legacyImported"
  | "dataQualityStatus"
  | "exclusionReason"
>;

export type TicketFactValues = TicketFactState;

export type TicketFactProjectionDecision =
  | { outcome: "APPLIED"; reasonCode: null; values: TicketFactValues }
  | {
      outcome: "IGNORED";
      reasonCode: string;
      values: TicketFactValues | null;
    };

function initialDataQuality(event: ReportingEventEnvelope): {
  status: ReportingDataQualityStatus;
  reason: string | null;
} {
  const dimensions = event.payload.dimensions;
  if (isHistoricalIncompleteEvent(event)) {
    return { status: "EXCLUDED", reason: "HISTORICAL_INCOMPLETE" };
  }
  if (Boolean(dimensions.legacyImported)) {
    return { status: "EXCLUDED", reason: "LEGACY_IMPORTED" };
  }
  if (
    dimensions.snapshotStatus !== "COMPLETE" ||
    !dimensions.partyType ||
    !dimensions.priority ||
    !dimensions.service ||
    !dimensions.requestType ||
    !dimensions.supportTeam ||
    !dimensions.queue ||
    !dimensions.slaPolicy ||
    !dimensions.slaPolicy.startedAt ||
    !dimensions.slaPolicy.firstResponseDueAt ||
    !dimensions.slaPolicy.resolutionDueAt
  ) {
    return { status: "INCOMPLETE", reason: "MISSING_REQUIRED_DIMENSIONS" };
  }
  return { status: "HEALTHY", reason: null };
}

function partyType(value: "INDIVIDUAL" | "ORGANIZATION" | null | undefined): PartyType | null {
  if (value === "INDIVIDUAL") return "PERSON";
  return value ?? null;
}

function durationBetween(start: Date | null, end: Date, pause: bigint): bigint | null {
  if (!start) return null;
  const elapsed = BigInt(Math.max(0, end.getTime() - start.getTime()));
  return elapsed > pause ? elapsed - pause : BigInt(0);
}

function terminalSlaState(
  snapshotState: SlaTargetState | undefined,
  currentState: SlaTargetState | null
): SlaTargetState | null {
  return snapshotState && TERMINAL_SLA_STATES.has(snapshotState)
    ? snapshotState
    : currentState;
}

function markIncomplete(
  values: TicketFactValues,
  reason: string
): TicketFactValues {
  if (values.dataQualityStatus === "EXCLUDED") return values;
  return { ...values, dataQualityStatus: "INCOMPLETE", exclusionReason: reason };
}

function snapshotRoutingDimensions(
  values: TicketFactValues,
  event: ReportingEventEnvelope
): TicketFactValues {
  const dimensions = event.payload.dimensions;
  return {
    ...values,
    supportTeamId: parseInternalNumericId(dimensions.supportTeam?.id, "supportTeam.id"),
    supportTeamCode: dimensions.supportTeam?.code ?? null,
    supportTeamName: dimensions.supportTeam?.name ?? null,
    queueId: parseInternalNumericId(dimensions.queue?.id, "queue.id"),
    queueCode: dimensions.queue?.code ?? null,
    queueName: dimensions.queue?.name ?? null,
    ownerUserId: parseInternalNumericId(dimensions.ownerUserId, "ownerUserId"),
  };
}

function createInitialFact(event: ReportingEventEnvelope): TicketFactValues {
  const dimensions = event.payload.dimensions;
  const quality = initialDataQuality(event);
  const legacyImported = Boolean(dimensions.legacyImported);
  const hasSla = Boolean(dimensions.slaPolicy) && !legacyImported;
  return {
    sourceAggregateVersion: event.aggregateVersion ?? 0,
    sourceLastEventId: event.eventId,
    ticketCreatedAt: event.occurredAtDate,
    slaStartedAt: parseOptionalEventDate(
      dimensions.slaPolicy?.startedAt,
      "slaPolicy.startedAt"
    ),
    firstResponseDueAt: parseOptionalEventDate(
      dimensions.slaPolicy?.firstResponseDueAt,
      "slaPolicy.firstResponseDueAt"
    ),
    resolutionDueAt: parseOptionalEventDate(
      dimensions.slaPolicy?.resolutionDueAt,
      "slaPolicy.resolutionDueAt"
    ),
    firstHumanPublicResponseAt: null,
    firstResponsePauseMilliseconds: BigInt(0),
    firstResponseEffectiveMilliseconds: null,
    firstResolvedAt: null,
    resolutionPauseMilliseconds: BigInt(0),
    resolutionEffectiveMilliseconds: null,
    firstClosedAt: null,
    lastClosedAt: null,
    fcrMaturesAt: null,
    fcrStatus: "EXCLUDED",
    firstResponseSlaState: hasSla ? "PENDING" : "NOT_APPLICABLE",
    resolutionSlaState: hasSla ? "PENDING" : "NOT_APPLICABLE",
    reopenedWithinWindow: null,
    reopenCount: 0,
    resolutionRejectionCount: 0,
    reopenWithinWindowEventCount: 0,
    customerReopenWithinWindowCount: 0,
    staffReopenWithinWindowCount: 0,
    systemReopenWithinWindowCount: 0,
    publicStaffMessageCount: 0,
    publicCustomerMessageCount: 0,
    transferCount: 0,
    collaborationCount: 0,
    hasCustomerReplyAfterFirstResponse: false,
    rating: null,
    ratedAt: null,
    serviceId: parseInternalNumericId(dimensions.service?.id, "service.id"),
    serviceCode: dimensions.service?.code ?? null,
    serviceName: dimensions.service?.name ?? null,
    requestTypeId: parseInternalNumericId(dimensions.requestType?.id, "requestType.id"),
    requestTypeCode: dimensions.requestType?.code ?? null,
    requestTypeName: dimensions.requestType?.name ?? null,
    supportTeamId: parseInternalNumericId(dimensions.supportTeam?.id, "supportTeam.id"),
    supportTeamCode: dimensions.supportTeam?.code ?? null,
    supportTeamName: dimensions.supportTeam?.name ?? null,
    queueId: parseInternalNumericId(dimensions.queue?.id, "queue.id"),
    queueCode: dimensions.queue?.code ?? null,
    queueName: dimensions.queue?.name ?? null,
    ownerUserId: parseInternalNumericId(dimensions.ownerUserId, "ownerUserId"),
    organizationId: parseInternalNumericId(
      event.scope.organizationId,
      "scope.organizationId"
    ),
    partyType: partyType(dimensions.partyType),
    partyKeyHash: dimensions.partyKeyHash ?? null,
    normalizedRootCauseId: parseInternalNumericId(
      dimensions.normalizedRootCause?.id,
      "normalizedRootCause.id"
    ),
    normalizedRootCauseCode: dimensions.normalizedRootCause?.code ?? null,
    normalizedRootCauseName: dimensions.normalizedRootCause?.name ?? null,
    incidentKey: dimensions.incidentKey ?? null,
    priorityAtCreation: dimensions.priority ?? null,
    priorityAtResolution: null,
    channel: dimensions.channel ?? null,
    slaPolicyCode: dimensions.slaPolicy?.code ?? null,
    slaPolicyVersion: dimensions.slaPolicy?.version ?? null,
    legacyImported,
    dataQualityStatus: quality.status,
    exclusionReason: quality.reason,
  };
}

function withSourceCursor(
  current: TicketFactValues,
  event: ReportingEventEnvelope
): TicketFactValues {
  return {
    ...current,
    sourceAggregateVersion: Math.max(
      current.sourceAggregateVersion,
      event.aggregateVersion ?? current.sourceAggregateVersion
    ),
    sourceLastEventId: event.eventId,
  };
}

function projectPublicStaffResponse(
  values: TicketFactValues,
  event: ReportingEventEnvelope
): TicketFactValues {
  let next = {
    ...values,
    publicStaffMessageCount: values.publicStaffMessageCount + 1,
  };
  if (values.firstHumanPublicResponseAt) return next;
  const effective = durationBetween(
    values.slaStartedAt,
    event.occurredAtDate,
    values.firstResponsePauseMilliseconds
  );
  next = {
    ...next,
    firstHumanPublicResponseAt: event.occurredAtDate,
    firstResponseEffectiveMilliseconds: effective,
    firstResponseSlaState: terminalSlaState(
      event.payload.dimensions.slaPolicy?.firstResponseState,
      values.firstResponseSlaState
    ),
  };
  if (effective === null) return markIncomplete(next, "MISSING_SLA_START_EVENT");
  if (
    !next.firstResponseSlaState ||
    !TERMINAL_SLA_STATES.has(next.firstResponseSlaState)
  ) {
    return markIncomplete(next, "MISSING_FIRST_RESPONSE_SLA_STATE");
  }
  return next;
}

function recordReopenInsideFirstClosureWindow(
  values: TicketFactValues,
  event: ReportingEventEnvelope
): TicketFactValues {
  const isInsideWindow = Boolean(
    values.firstClosedAt &&
      values.fcrMaturesAt &&
      event.occurredAtDate >= values.firstClosedAt &&
      event.occurredAtDate <= values.fcrMaturesAt
  );
  if (!isInsideWindow) return values;

  const sourceCounters =
    event.actor.type === "USER"
      ? {
          customerReopenWithinWindowCount:
            values.customerReopenWithinWindowCount + 1,
        }
      : event.actor.type === "STAFF"
        ? {
            staffReopenWithinWindowCount:
              values.staffReopenWithinWindowCount + 1,
          }
        : {
            systemReopenWithinWindowCount:
              values.systemReopenWithinWindowCount + 1,
          };

  return {
    ...values,
    ...sourceCounters,
    reopenedWithinWindow: true,
    reopenWithinWindowEventCount: values.reopenWithinWindowEventCount + 1,
    fcrStatus: "NOT_ACHIEVED",
  };
}

function projectEvent(
  current: TicketFactValues,
  eventType: TicketDomainEventType,
  event: ReportingEventEnvelope
): TicketFactValues | null {
  let next = withSourceCursor(current, event);
  const dimensions = event.payload.dimensions;
  next = {
    ...next,
    partyKeyHash: next.partyKeyHash ?? dimensions.partyKeyHash ?? null,
    normalizedRootCauseId:
      parseInternalNumericId(
        dimensions.normalizedRootCause?.id,
        "normalizedRootCause.id"
      ) ?? next.normalizedRootCauseId,
    normalizedRootCauseCode:
      dimensions.normalizedRootCause?.code ?? next.normalizedRootCauseCode,
    normalizedRootCauseName:
      dimensions.normalizedRootCause?.name ?? next.normalizedRootCauseName,
    incidentKey: dimensions.incidentKey ?? next.incidentKey,
  };

  if (eventType === TICKET_EVENT_TYPES.ROUTED || eventType === TICKET_EVENT_TYPES.ASSIGNED) {
    return snapshotRoutingDimensions(next, event);
  }
  if (eventType === TICKET_EVENT_TYPES.TRANSFERRED) {
    return {
      ...snapshotRoutingDimensions(next, event),
      transferCount: next.transferCount + 1,
      fcrStatus: next.firstResolvedAt ? "NOT_ACHIEVED" : next.fcrStatus,
    };
  }
  if (eventType === TICKET_EVENT_TYPES.COLLABORATOR_ADDED) {
    return {
      ...next,
      collaborationCount: next.collaborationCount + 1,
      fcrStatus: next.firstResolvedAt ? "NOT_ACHIEVED" : next.fcrStatus,
    };
  }
  if (
    eventType === TICKET_EVENT_TYPES.PUBLIC_MESSAGE_ADDED ||
    eventType === TICKET_EVENT_TYPES.CUSTOMER_INPUT_REQUESTED
  ) {
    if (event.actor.type === "STAFF" && event.sourceType === "HUMAN") {
      return projectPublicStaffResponse(next, event);
    }
    if (eventType === TICKET_EVENT_TYPES.PUBLIC_MESSAGE_ADDED && event.actor.type === "USER") {
      return {
        ...next,
        publicCustomerMessageCount: next.publicCustomerMessageCount + 1,
        hasCustomerReplyAfterFirstResponse:
          next.hasCustomerReplyAfterFirstResponse ||
          next.firstHumanPublicResponseAt !== null,
        fcrStatus:
          next.firstHumanPublicResponseAt && next.firstResolvedAt
            ? "NOT_ACHIEVED"
            : next.fcrStatus,
      };
    }
    return next;
  }
  if (eventType === SLA_EVENT_TYPES.STARTED) {
    const legacyExcluded = event.payload.attributes.legacyExcluded === true;
    return {
      ...next,
      slaStartedAt:
        next.slaStartedAt ??
        parseOptionalEventDate(dimensions.slaPolicy?.startedAt, "slaPolicy.startedAt") ??
        event.occurredAtDate,
      firstResponseDueAt:
        next.firstResponseDueAt ??
        parseOptionalEventDate(
          dimensions.slaPolicy?.firstResponseDueAt,
          "slaPolicy.firstResponseDueAt"
        ),
      resolutionDueAt:
        next.resolutionDueAt ??
        parseOptionalEventDate(
          dimensions.slaPolicy?.resolutionDueAt,
          "slaPolicy.resolutionDueAt"
        ),
      firstResponseSlaState: legacyExcluded ? "NOT_APPLICABLE" : next.firstResponseSlaState,
      resolutionSlaState: legacyExcluded ? "NOT_APPLICABLE" : next.resolutionSlaState,
    };
  }
  if (eventType === SLA_EVENT_TYPES.RESUMED) {
    const pause = event.payload.attributes.effectivePauseMilliseconds;
    if (typeof pause !== "number" || !Number.isSafeInteger(pause) || pause < 0) {
      throw new ReportingProjectionError(
        "SLA resume event is missing a valid effective pause",
        "INVALID_SLA_PAUSE_DURATION"
      );
    }
    return {
      ...next,
      resolutionPauseMilliseconds:
        next.resolutionPauseMilliseconds + BigInt(pause),
    };
  }
  if (eventType === SLA_EVENT_TYPES.RESOLUTION_RESTARTED) {
    return {
      ...next,
      resolutionDueAt:
        parseOptionalEventDate(
          dimensions.slaPolicy?.resolutionDueAt,
          "slaPolicy.resolutionDueAt"
        ) ?? next.resolutionDueAt,
      resolutionSlaState: "PENDING",
      resolutionPauseMilliseconds: BigInt(0),
    };
  }
  if (eventType === SLA_EVENT_TYPES.BREACHED) {
    const target = event.payload.attributes.target;
    if (target === "FIRST_RESPONSE") {
      return { ...next, firstResponseSlaState: "BREACHED" };
    }
    if (target === "RESOLUTION") {
      return { ...next, resolutionSlaState: "BREACHED" };
    }
    throw new ReportingProjectionError(
      "SLA breach event has an invalid target",
      "INVALID_SLA_TARGET"
    );
  }
  if (eventType === TICKET_EVENT_TYPES.RESOLVED) {
    if (next.firstResolvedAt) return next;
    const effective = durationBetween(
      next.slaStartedAt,
      event.occurredAtDate,
      next.resolutionPauseMilliseconds
    );
    next = {
      ...next,
      firstResolvedAt: event.occurredAtDate,
      resolutionEffectiveMilliseconds: effective,
      resolutionSlaState: terminalSlaState(
        dimensions.slaPolicy?.resolutionState,
        next.resolutionSlaState
      ),
      priorityAtResolution: dimensions.priority ?? null,
    };
    if (effective === null) return markIncomplete(next, "MISSING_SLA_START_EVENT");
    if (!next.resolutionSlaState || !TERMINAL_SLA_STATES.has(next.resolutionSlaState)) {
      return markIncomplete(next, "MISSING_RESOLUTION_SLA_STATE");
    }
    return next;
  }
  if (eventType === TICKET_EVENT_TYPES.CLOSED) {
    const maturesAt = new Date(event.occurredAtDate.getTime() + FCR_WINDOW_MILLISECONDS);
    return {
      ...next,
      firstClosedAt: next.firstClosedAt ?? event.occurredAtDate,
      lastClosedAt: event.occurredAtDate,
      fcrMaturesAt: next.fcrMaturesAt ?? maturesAt,
      fcrStatus:
        next.dataQualityStatus === "HEALTHY" && next.firstResolvedAt
          ? "PENDING_WINDOW"
          : "EXCLUDED",
      reopenedWithinWindow: next.reopenedWithinWindow ?? false,
    };
  }
  if (eventType === TICKET_EVENT_TYPES.REOPENED) {
    return recordReopenInsideFirstClosureWindow({
      ...next,
      reopenCount: next.reopenCount + 1,
    }, event);
  }
  if (eventType === TICKET_EVENT_TYPES.RESOLUTION_REJECTED) {
    return recordReopenInsideFirstClosureWindow({
      ...next,
      resolutionRejectionCount: next.resolutionRejectionCount + 1,
      fcrStatus: "NOT_ACHIEVED",
    }, event);
  }
  if (eventType === TICKET_EVENT_TYPES.RATED) {
    const rating = event.payload.attributes.rating;
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new ReportingProjectionError(
        "Ticket rating event has an invalid rating",
        "INVALID_RATING"
      );
    }
    return { ...next, rating, ratedAt: event.occurredAtDate };
  }

  return null;
}

export function projectTicketReportingFact(
  current: TicketFactState | null,
  eventType: TicketDomainEventType,
  event: ReportingEventEnvelope
): TicketFactProjectionDecision {
  const creationEvent =
    eventType === TICKET_EVENT_TYPES.CREATED ||
    eventType === TICKET_EVENT_TYPES.IMPORTED;

  if (!current) {
    if (!creationEvent) {
      throw new ReportingProjectionError(
        `Reporting aggregate ${event.aggregateId} has no creation event`,
        "AGGREGATE_START_MISSING"
      );
    }
    if (event.aggregateVersion !== null && event.aggregateVersion !== 1) {
      throw new ReportingProjectionError(
        `Reporting aggregate ${event.aggregateId} starts at version ${event.aggregateVersion}`,
        "AGGREGATE_VERSION_GAP"
      );
    }
    return { outcome: "APPLIED", reasonCode: null, values: createInitialFact(event) };
  }

  if (creationEvent) {
    return { outcome: "IGNORED", reasonCode: "DUPLICATE_AGGREGATE_START", values: null };
  }
  if (isHistoricalIncompleteEvent(event)) {
    return { outcome: "IGNORED", reasonCode: "HISTORICAL_INCOMPLETE_EVENT", values: null };
  }
  if (current.exclusionReason === "HISTORICAL_INCOMPLETE") {
    return { outcome: "IGNORED", reasonCode: "FACT_EXCLUDED_HISTORICAL", values: null };
  }

  const aggregateVersion = event.aggregateVersion;
  if (aggregateVersion === null) {
    return { outcome: "IGNORED", reasonCode: "MISSING_AGGREGATE_VERSION", values: null };
  }
  if (aggregateVersion < current.sourceAggregateVersion) {
    return { outcome: "IGNORED", reasonCode: "STALE_AGGREGATE_VERSION", values: null };
  }
  if (aggregateVersion > current.sourceAggregateVersion + 1) {
    throw new ReportingProjectionError(
      `Reporting aggregate ${event.aggregateId} expected version ${current.sourceAggregateVersion + 1} but received ${aggregateVersion}`,
      "AGGREGATE_VERSION_GAP"
    );
  }

  const projected = projectEvent({ ...current }, eventType, event);
  if (!projected) {
    return {
      outcome: "IGNORED",
      reasonCode: "NO_TICKET_FACT_EFFECT",
      values: withSourceCursor({ ...current }, event),
    };
  }
  return { outcome: "APPLIED", reasonCode: null, values: projected };
}

export function matureFcrStatus(fact: Pick<
  TicketFactState,
  | "dataQualityStatus"
  | "firstHumanPublicResponseAt"
  | "firstResolvedAt"
  | "firstClosedAt"
  | "hasCustomerReplyAfterFirstResponse"
  | "transferCount"
  | "collaborationCount"
  | "reopenedWithinWindow"
  | "resolutionRejectionCount"
>): ReportingFcrStatus {
  if (
    fact.dataQualityStatus !== "HEALTHY" ||
    !fact.firstHumanPublicResponseAt ||
    !fact.firstResolvedAt ||
    !fact.firstClosedAt
  ) {
    return "EXCLUDED";
  }
  return fact.hasCustomerReplyAfterFirstResponse ||
    fact.transferCount > 0 ||
    fact.collaborationCount > 0 ||
    fact.resolutionRejectionCount > 0 ||
    fact.reopenedWithinWindow
    ? "NOT_ACHIEVED"
    : "ACHIEVED";
}

export type TicketFactEnumCompatibility = {
  partyType: PartyType | null;
  priority: SupportPriority | null;
  fcrStatus: ReportingFcrStatus;
  dataQualityStatus: ReportingDataQualityStatus;
  slaState: SlaTargetState | null;
};
