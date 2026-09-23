import { TicketCommandError } from "@/modules/tickets/domain/ticket-command-error";

export function ticketEtag(ticketId: string, version: number): string {
  return `W/"ticket-${ticketId}-v${version}"`;
}

export function requireExpectedTicketVersion(
  ticketId: string,
  currentVersion: number,
  ifMatch: string | null
): void {
  if (!ifMatch) {
    throw new TicketCommandError(
      "ارسال نسخه تیکت برای این عملیات الزامی است",
      "PRECONDITION_REQUIRED",
      428
    );
  }
  if (ifMatch !== ticketEtag(ticketId, currentVersion)) {
    throw new TicketCommandError(
      "تیکت هم‌زمان تغییر کرده است؛ اطلاعات را تازه‌سازی کنید",
      "CONCURRENT_MODIFICATION",
      409
    );
  }
}
