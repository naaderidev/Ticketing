const SAFE_TICKET_IDENTIFIER = /^TK-[A-Z0-9-]{1,97}$/i;

export function isSafeTicketIdentifier(value: string): boolean {
  return SAFE_TICKET_IDENTIFIER.test(value);
}
