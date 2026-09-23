import { timingSafeEqual } from "node:crypto";
import { hashSecurityValue } from "@/lib/request-security";
import { TicketCommandError } from "@/modules/tickets/domain/ticket-command-error";

type TicketCursor = { updatedAt: string; id: number };

function cursorSignature(payload: string): string {
  return hashSecurityValue("ticket-list-cursor", payload);
}

export function encodeTicketCursor(cursor: TicketCursor): string {
  const payload = Buffer.from(JSON.stringify(cursor)).toString("base64url");
  return `${payload}.${cursorSignature(payload)}`;
}

export function decodeTicketCursor(value: string): {
  updatedAt: Date;
  id: number;
} {
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) {
    throw new TicketCommandError("Cursor معتبر نیست", "INVALID_CURSOR", 422);
  }

  const expected = cursorSignature(payload);
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    signatureBytes.length !== expectedBytes.length ||
    !timingSafeEqual(signatureBytes, expectedBytes)
  ) {
    throw new TicketCommandError("Cursor معتبر نیست", "INVALID_CURSOR", 422);
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TicketCursor;
    const updatedAt = new Date(parsed.updatedAt);
    if (
      !Number.isSafeInteger(parsed.id) ||
      parsed.id <= 0 ||
      Number.isNaN(updatedAt.getTime())
    ) {
      throw new Error("invalid cursor payload");
    }
    return { updatedAt, id: parsed.id };
  } catch {
    throw new TicketCommandError("Cursor معتبر نیست", "INVALID_CURSOR", 422);
  }
}
