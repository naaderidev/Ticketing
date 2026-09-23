import {
  decodeTicketCursor,
  encodeTicketCursor,
} from "@/modules/tickets/application/ticket-cursor";
import {
  decodeTicketTimelineCursor,
  encodeTicketTimelineCursor,
} from "@/modules/tickets/application/ticket-timeline-cursor";

describe("ticket cursor", () => {
  it("round-trips a signed cursor", () => {
    const value = encodeTicketCursor({
      updatedAt: "2026-09-13T10:00:00.000Z",
      id: 42,
    });
    expect(decodeTicketCursor(value)).toEqual({
      updatedAt: new Date("2026-09-13T10:00:00.000Z"),
      id: 42,
    });
  });

  it("rejects a modified cursor", () => {
    const value = encodeTicketCursor({
      updatedAt: "2026-09-13T10:00:00.000Z",
      id: 42,
    });
    expect(() => decodeTicketCursor(`${value}x`)).toThrow(
      expect.objectContaining({ code: "INVALID_CURSOR" })
    );
  });

  it("round-trips and authenticates mixed timeline positions", () => {
    const value = encodeTicketTimelineCursor({
      createdAt: new Date("2026-09-13T10:00:00.000Z"),
      kind: "MESSAGE",
      id: BigInt(42),
    });
    expect(decodeTicketTimelineCursor(value)).toEqual({
      createdAt: new Date("2026-09-13T10:00:00.000Z"),
      kind: "MESSAGE",
      id: BigInt(42),
    });
    const replacement = value.endsWith("0") ? "1" : "0";
    expect(() =>
      decodeTicketTimelineCursor(`${value.slice(0, -1)}${replacement}`)
    ).toThrow(
      expect.objectContaining({ code: "INVALID_CURSOR" })
    );
  });
});
