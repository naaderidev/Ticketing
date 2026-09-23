export type UserRole = "USER" | "ADMIN";

export type TicketPermission =
  | "read"
  | "reply"
  | "close"
  | "manage"
  | "delete"
  | "rate";

interface PolicyUser {
  id: number;
  role: UserRole;
}

interface PolicyTicket {
  userId: number | null;
}

interface PolicyNotification {
  userId: number | null;
  recipientType: "USER" | "ADMIN";
}

const ADMIN_TICKET_PERMISSIONS = new Set<TicketPermission>([
  "read",
  "reply",
  "close",
  "manage",
  "delete",
]);

const OWNER_TICKET_PERMISSIONS = new Set<TicketPermission>([
  "read",
  "reply",
  "close",
  "rate",
]);

export function hasTicketPermission(
  user: PolicyUser,
  ticket: PolicyTicket,
  permission: TicketPermission
): boolean {
  if (user.role === "ADMIN") {
    return ADMIN_TICKET_PERMISSIONS.has(permission);
  }

  return (
    ticket.userId === user.id && OWNER_TICKET_PERMISSIONS.has(permission)
  );
}

export function hasNotificationPermission(
  user: PolicyUser,
  notification: PolicyNotification
): boolean {
  if (user.role === "ADMIN") {
    return notification.recipientType === "ADMIN";
  }

  return (
    notification.recipientType === "USER" && notification.userId === user.id
  );
}
