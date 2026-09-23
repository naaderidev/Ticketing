export const TICKET_EVENT_TYPES = {
  IMPORTED: "ticket.imported.v1",
  CREATED: "ticket.created.v1",
  ROUTED: "ticket.routed.v1",
  ASSIGNED: "ticket.assigned.v1",
  TRANSFERRED: "ticket.transferred.v1",
  PRIORITY_CHANGED: "ticket.priority_changed.v1",
  STATUS_CHANGED: "ticket.status_changed.v1",
  PUBLIC_MESSAGE_ADDED: "ticket.public_message_added.v1",
  INTERNAL_NOTE_ADDED: "ticket.internal_note_added.v1",
  CUSTOMER_INPUT_REQUESTED: "ticket.customer_input_requested.v1",
  CUSTOMER_REPLIED: "ticket.customer_replied.v1",
  RESOLVED: "ticket.resolved.v1",
  RESOLUTION_CONFIRMED: "ticket.resolution_confirmed.v1",
  RESOLUTION_REJECTED: "ticket.resolution_rejected.v1",
  CLOSED: "ticket.closed.v1",
  REOPENED: "ticket.reopened.v1",
  RATED: "ticket.rated.v1",
  BUSINESS_REFERENCE_LINKED: "ticket.business_reference_linked.v1",
  COLLABORATOR_ADDED: "ticket.collaborator_added.v1",
  COLLABORATION_COMPLETED: "ticket.collaboration_completed.v1",
  COLLABORATION_CANCELLED: "ticket.collaboration_cancelled.v1",
  MERGED: "ticket.merged.v1",
  RESOLUTION_REMINDER: "ticket.resolution_reminder.v1",
} as const;

export const SLA_EVENT_TYPES = {
  STARTED: "sla.started.v1",
  PAUSED: "sla.paused.v1",
  RESUMED: "sla.resumed.v1",
  RESOLUTION_RESTARTED: "sla.resolution_restarted.v1",
  WARNING_REACHED: "sla.warning_reached.v1",
  BREACHED: "sla.breached.v1",
  ESCALATED: "sla.escalated.v1",
} as const;

export const ROUTING_EVENT_TYPES = {
  OVERRIDDEN: "routing.overridden.v1",
} as const;

const DOMAIN_EVENT_TYPES = {
  ...TICKET_EVENT_TYPES,
  ...SLA_EVENT_TYPES,
  ...ROUTING_EVENT_TYPES,
} as const;

export type TicketDomainEventType =
  (typeof DOMAIN_EVENT_TYPES)[keyof typeof DOMAIN_EVENT_TYPES];

export type TicketEventActorType = "USER" | "STAFF" | "SYSTEM";
export type TicketEventSourceType = "HUMAN" | "AUTOMATION" | "MIGRATION";

const canonicalEventTypes = new Set<string>(Object.values(DOMAIN_EVENT_TYPES));

const legacyEventAliases: Readonly<Record<string, TicketDomainEventType>> = {
  "ticket.staff_replied.v1": TICKET_EVENT_TYPES.PUBLIC_MESSAGE_ADDED,
  "ticket.closed_legacy.v1": TICKET_EVENT_TYPES.CLOSED,
  "ticket.reopened_legacy.v1": TICKET_EVENT_TYPES.REOPENED,
};

export function isTicketDomainEventType(
  value: string
): value is TicketDomainEventType {
  return canonicalEventTypes.has(value);
}

export function canonicalizeTicketDomainEventType(
  value: string
): TicketDomainEventType | null {
  if (isTicketDomainEventType(value)) return value;
  return legacyEventAliases[value] ?? null;
}

export function requireTicketDomainEventType(
  value: string
): TicketDomainEventType {
  const canonical = canonicalizeTicketDomainEventType(value);
  if (!canonical) {
    throw new Error(`Unknown ticket domain event type: ${value}`);
  }
  return canonical;
}
