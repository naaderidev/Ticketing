import { readFileSync } from "node:fs";
import { join } from "node:path";

const projectFile = (...segments: string[]) =>
  readFileSync(join(process.cwd(), ...segments), "utf8");

const schema = projectFile("prisma", "schema.prisma");
const resetScript = projectFile("scripts", "reset-and-seed-product-data.mjs");
const outboxSource = projectFile(
  "src",
  "modules",
  "tickets",
  "application",
  "ticket-event-outbox.ts"
);
const eventCatalog = projectFile(
  "src",
  "modules",
  "tickets",
  "contracts",
  "ticket-domain-events.ts"
);

describe("ticket domain event persistence contract", () => {
  it("persists event identity, version, actor and source on TicketEvent", () => {
    expect(schema).toMatch(/eventId\s+String\s+@unique\s+@db\.Char\(36\)/);
    expect(schema).toMatch(/aggregateVersion\s+Int\?/);
    expect(schema).toMatch(/actorType\s+TicketEventActorType/);
    expect(schema).toMatch(/sourceType\s+TicketEventSourceType/);
    expect(schema).toContain("@@index([ticketId, aggregateVersion, id])");
  });

  it("seeds fresh demo events with identity and aggregate versions", () => {
    expect(resetScript).toContain("const eventId = randomUUID()");
    expect(resetScript).toContain("aggregateVersion: context.aggregateVersion");
    expect(resetScript).toContain("sourceType:");
  });

  it("uses one typed catalog instead of accepting arbitrary event strings", () => {
    expect(outboxSource).toContain("type: TicketDomainEventType");
    expect(outboxSource).toContain("requireTicketDomainEventType(input.type)");
    expect(eventCatalog).toContain('"ticket.public_message_added.v1"');
    expect(eventCatalog).toContain('"ticket.staff_replied.v1"');
  });

  it("does not copy arbitrary TicketEvent metadata into Outbox", () => {
    expect(outboxSource).toContain("safeTicketEventAttributes(eventType, input.metadata)");
    expect(outboxSource).not.toContain("metadata: input.metadata ?? null");
    expect(outboxSource).toContain("attributes: safeTicketEventAttributes");
  });
});
