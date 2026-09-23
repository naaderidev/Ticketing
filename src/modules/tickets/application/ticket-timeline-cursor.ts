import { timingSafeEqual } from "node:crypto";
import { hashSecurityValue } from "@/lib/request-security";
import { TicketCommandError } from "@/modules/tickets/domain/ticket-command-error";

export type TicketTimelineCursor = {
  createdAt: Date;
  kind: "EVENT" | "MESSAGE";
  id: bigint;
};

function signature(payload: string): string {
  return hashSecurityValue("ticket-timeline-cursor", payload);
}

export function encodeTicketTimelineCursor(
  cursor: TicketTimelineCursor
): string {
  const payload = Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      kind: cursor.kind,
      id: cursor.id.toString(),
    })
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function decodeTicketTimelineCursor(
  value: string
): TicketTimelineCursor {
  const [payload, providedSignature, extra] = value.split(".");
  if (!payload || !providedSignature || extra) {
    throw new TicketCommandError("Cursor معتبر نیست", "INVALID_CURSOR", 422);
  }
  const expectedSignature = signature(payload);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new TicketCommandError("Cursor معتبر نیست", "INVALID_CURSOR", 422);
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { createdAt: string; kind: string; id: string };
    const createdAt = new Date(parsed.createdAt);
    const id = BigInt(parsed.id);
    if (
      Number.isNaN(createdAt.getTime()) ||
      (parsed.kind !== "EVENT" && parsed.kind !== "MESSAGE") ||
      id <= BigInt(0)
    ) {
      throw new Error("invalid timeline cursor payload");
    }
    return { createdAt, kind: parsed.kind, id };
  } catch {
    throw new TicketCommandError("Cursor معتبر نیست", "INVALID_CURSOR", 422);
  }
}
