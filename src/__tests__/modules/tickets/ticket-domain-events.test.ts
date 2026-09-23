import {
  TICKET_EVENT_TYPES,
  canonicalizeTicketDomainEventType,
  isTicketDomainEventType,
} from "@/modules/tickets/contracts/ticket-domain-events";

describe("ticket domain event catalog", () => {
  it("accepts canonical event names and rejects free-form names", () => {
    expect(isTicketDomainEventType(TICKET_EVENT_TYPES.PUBLIC_MESSAGE_ADDED)).toBe(true);
    expect(isTicketDomainEventType("ticket.staff_replied.v1")).toBe(false);
    expect(isTicketDomainEventType("ticket.public_message_added.v2")).toBe(false);
  });

  it.each([
    ["ticket.staff_replied.v1", TICKET_EVENT_TYPES.PUBLIC_MESSAGE_ADDED],
    ["ticket.closed_legacy.v1", TICKET_EVENT_TYPES.CLOSED],
    ["ticket.reopened_legacy.v1", TICKET_EVENT_TYPES.REOPENED],
  ])("normalizes the historical alias %s", (legacyName, expected) => {
    expect(canonicalizeTicketDomainEventType(legacyName)).toBe(expected);
  });

  it("ignores unknown events without inventing a mapping", () => {
    expect(canonicalizeTicketDomainEventType("ticket.not_registered.v1")).toBeNull();
  });
});
