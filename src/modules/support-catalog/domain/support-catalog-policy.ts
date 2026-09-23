export type ActiveWindow = {
  status: "ACTIVE" | "REVOKED";
  validFrom: Date;
  validTo: Date | null;
};

export function isActiveSupportAssignment(
  assignment: ActiveWindow,
  now: Date
): boolean {
  return (
    assignment.status === "ACTIVE" &&
    assignment.validFrom <= now &&
    (assignment.validTo === null || assignment.validTo > now)
  );
}

export function canUseQueue(input: {
  hasGlobalPermission: boolean;
  assignment: ActiveWindow | null;
  now: Date;
}): boolean {
  return (
    input.hasGlobalPermission ||
    (input.assignment !== null &&
      isActiveSupportAssignment(input.assignment, input.now))
  );
}
