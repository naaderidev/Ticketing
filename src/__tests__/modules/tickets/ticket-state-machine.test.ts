import { canTransitionTicket } from "@/modules/tickets/domain/ticket-state-machine";
import {
  requireExpectedTicketVersion,
  ticketEtag,
} from "@/modules/tickets/domain/ticket-version";

describe("ticket lifecycle", () => {
  it("allows only actor-specific transitions", () => {
    expect(canTransitionTicket("UNASSIGNED", "IN_PROGRESS", "STAFF")).toBe(true);
    expect(canTransitionTicket("RESOLVED", "CLOSED", "CUSTOMER")).toBe(true);
    expect(canTransitionTicket("RESOLVED", "REOPENED", "CUSTOMER")).toBe(true);
    expect(canTransitionTicket("IN_PROGRESS", "CLOSED", "STAFF")).toBe(false);
    expect(canTransitionTicket("CLOSED_LEGACY", "REOPENED", "CUSTOMER")).toBe(false);
  });

  it("uses weak ETags as an optimistic concurrency boundary", () => {
    const etag = ticketEtag("TK-ABC-12345678", 3);
    expect(() =>
      requireExpectedTicketVersion("TK-ABC-12345678", 3, etag)
    ).not.toThrow();
    expect(() =>
      requireExpectedTicketVersion("TK-ABC-12345678", 3, null)
    ).toThrow(expect.objectContaining({ code: "PRECONDITION_REQUIRED" }));
    expect(() =>
      requireExpectedTicketVersion("TK-ABC-12345678", 3, ticketEtag("TK-ABC-12345678", 2))
    ).toThrow(expect.objectContaining({ code: "CONCURRENT_MODIFICATION" }));
  });
});
