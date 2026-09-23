export type MembershipState = {
  role: "REPRESENTATIVE" | "MANAGER";
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED";
  validFrom: Date;
  validTo: Date | null;
};

export function isMembershipActive(
  membership: MembershipState,
  now: Date
): boolean {
  return (
    membership.status === "ACTIVE" &&
    membership.validFrom <= now &&
    (membership.validTo === null || membership.validTo > now)
  );
}

export function canManageOrganizationMemberships(
  membership: MembershipState,
  now: Date
): boolean {
  return membership.role === "MANAGER" && isMembershipActive(membership, now);
}

export function canApproveAccessRequest(input: {
  actorUserId: number;
  requesterUserId: number;
  hasGlobalPermission: boolean;
  membership: MembershipState | null;
  now: Date;
}): boolean {
  if (input.actorUserId === input.requesterUserId) return false;
  return (
    input.hasGlobalPermission ||
    (input.membership !== null &&
      canManageOrganizationMemberships(input.membership, input.now))
  );
}
