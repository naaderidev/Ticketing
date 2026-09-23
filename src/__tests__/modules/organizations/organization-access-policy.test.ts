import {
  canApproveAccessRequest,
  canManageOrganizationMemberships,
  isMembershipActive,
} from "@/modules/organizations/domain/organization-access-policy";

const now = new Date("2026-09-13T10:00:00.000Z");
const activeManager = {
  role: "MANAGER" as const,
  status: "ACTIVE" as const,
  validFrom: new Date("2026-09-01T00:00:00.000Z"),
  validTo: null,
};

describe("organization access policy", () => {
  it("accepts only active memberships inside their validity window", () => {
    expect(isMembershipActive(activeManager, now)).toBe(true);
    expect(
      isMembershipActive(
        { ...activeManager, validFrom: new Date("2026-09-14T00:00:00.000Z") },
        now
      )
    ).toBe(false);
    expect(
      isMembershipActive(
        { ...activeManager, validTo: new Date("2026-09-13T09:59:59.000Z") },
        now
      )
    ).toBe(false);
    expect(
      isMembershipActive({ ...activeManager, status: "SUSPENDED" }, now)
    ).toBe(false);
  });

  it("allows only an active organization manager to manage memberships", () => {
    expect(canManageOrganizationMemberships(activeManager, now)).toBe(true);
    expect(
      canManageOrganizationMemberships(
        { ...activeManager, role: "REPRESENTATIVE" },
        now
      )
    ).toBe(false);
  });

  it("forbids self-approval even for a global administrator", () => {
    expect(
      canApproveAccessRequest({
        actorUserId: 7,
        requesterUserId: 7,
        hasGlobalPermission: true,
        membership: activeManager,
        now,
      })
    ).toBe(false);
  });

  it("allows an independent global approver or active manager", () => {
    expect(
      canApproveAccessRequest({
        actorUserId: 8,
        requesterUserId: 7,
        hasGlobalPermission: true,
        membership: null,
        now,
      })
    ).toBe(true);
    expect(
      canApproveAccessRequest({
        actorUserId: 8,
        requesterUserId: 7,
        hasGlobalPermission: false,
        membership: activeManager,
        now,
      })
    ).toBe(true);
  });
});
