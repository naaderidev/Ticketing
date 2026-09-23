import type { TicketLifecycleStatus } from "@prisma/client";

export type TicketTransitionActor = "CUSTOMER" | "STAFF" | "LEGACY_ADAPTER";

const STAFF_TRANSITIONS: Readonly<
  Record<TicketLifecycleStatus, readonly TicketLifecycleStatus[]>
> = {
  NEW: ["UNASSIGNED", "IN_PROGRESS"],
  UNASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: [
    "WAITING_USER",
    "WAITING_INTERNAL",
    "INTERNAL_REFERRAL",
    "RESOLVED",
  ],
  INTERNAL_REFERRAL: ["IN_PROGRESS", "WAITING_INTERNAL"],
  WAITING_INTERNAL: ["IN_PROGRESS"],
  WAITING_USER: ["IN_PROGRESS"],
  RESOLVED: [],
  CLOSED: [],
  REOPENED: ["IN_PROGRESS"],
  CLOSED_LEGACY: [],
};

const CUSTOMER_TRANSITIONS: Readonly<
  Record<TicketLifecycleStatus, readonly TicketLifecycleStatus[]>
> = {
  NEW: [],
  UNASSIGNED: [],
  IN_PROGRESS: [],
  INTERNAL_REFERRAL: [],
  WAITING_INTERNAL: [],
  WAITING_USER: ["IN_PROGRESS"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: [],
  CLOSED_LEGACY: [],
};

export function canTransitionTicket(
  from: TicketLifecycleStatus,
  to: TicketLifecycleStatus,
  actor: TicketTransitionActor
): boolean {
  if (actor === "LEGACY_ADAPTER") {
    return to === "CLOSED_LEGACY" || to === "UNASSIGNED";
  }
  const transitions = actor === "STAFF" ? STAFF_TRANSITIONS : CUSTOMER_TRANSITIONS;
  return transitions[from].includes(to);
}
