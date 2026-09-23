import {
  addTicketMessageSchema,
  createTicketV2Schema,
  rateTicketV2Schema,
  ticketListV2QuerySchema,
} from "@/modules/tickets/contracts/ticket-schemas";
import { parseIdempotencyKey } from "@/modules/tickets/contracts/idempotency-key";
import { isSafeTicketIdentifier } from "@/modules/tickets/contracts/ticket-identifier";

describe("ticket v2 contracts", () => {
  it("normalizes create input and supplies bounded collection defaults", () => {
    expect(
      createTicketV2Schema.parse({
        requestTypeId: 2,
        subject: "  مشکل ورود  ",
        description: "  امکان ورود وجود ندارد  ",
      })
    ).toEqual({
      requestTypeId: 2,
      subject: "مشکل ورود",
      description: "امکان ورود وجود ندارد",
      businessReferences: [],
      attachments: [],
    });
  });

  it("rejects duplicate references and client-controlled routing fields", () => {
    const duplicate = {
      requestTypeId: 2,
      subject: "موضوع",
      description: "شرح",
      businessReferences: [
        { type: "CONTRACT", key: "C-1" },
        { type: "CONTRACT", key: "C-1" },
      ],
    };
    expect(createTicketV2Schema.safeParse(duplicate).success).toBe(false);
    expect(
      createTicketV2Schema.safeParse({
        requestTypeId: 2,
        subject: "موضوع",
        description: "شرح",
        queueId: 99,
      }).success
    ).toBe(false);
  });

  it("bounds pagination and requires a sufficiently strong idempotency key", () => {
    expect(ticketListV2QuerySchema.parse({})).toEqual({ limit: 25 });
    expect(ticketListV2QuerySchema.safeParse({ limit: 101 }).success).toBe(false);

    const invalid = parseIdempotencyKey(
      new Request("http://localhost", { headers: { "Idempotency-Key": "short" } })
    );
    const valid = parseIdempotencyKey(
      new Request("http://localhost", {
        headers: { "Idempotency-Key": "018f1f69-7f21-7d0b-a844-4cc3ea22e630" },
      })
    );
    expect(invalid.success).toBe(false);
    expect(valid).toEqual({
      success: true,
      data: "018f1f69-7f21-7d0b-a844-4cc3ea22e630",
    });
  });

  it("validates message and one-time rating command payloads strictly", () => {
    expect(
      addTicketMessageSchema.parse({ message: "  پیگیری درخواست  " })
    ).toEqual({ message: "پیگیری درخواست", attachments: [] });
    expect(rateTicketV2Schema.safeParse({ rating: 0 }).success).toBe(false);
    expect(
      rateTicketV2Schema.safeParse({ rating: 5, ticketId: "client-controlled" })
        .success
    ).toBe(false);
  });

  it("accepts migrated multi-segment ticket ids without accepting path input", () => {
    expect(isSafeTicketIdentifier("TK-SEED001-MTR4DWSL-C4AD0063")).toBe(true);
    expect(isSafeTicketIdentifier("TK-MTR2YC24-5C3492E9")).toBe(true);
    expect(isSafeTicketIdentifier("../TK-SEED001")).toBe(false);
    expect(isSafeTicketIdentifier("TK-ABC/DEF")).toBe(false);
  });
});
