import {
  canUseQueue,
  isActiveSupportAssignment,
} from "@/modules/support-catalog/domain/support-catalog-policy";

const now = new Date("2026-09-13T10:00:00.000Z");

describe("support catalog assignment policy", () => {
  it("accepts only a currently active assignment", () => {
    expect(
      isActiveSupportAssignment(
        {
          status: "ACTIVE",
          validFrom: new Date("2026-09-13T09:00:00.000Z"),
          validTo: new Date("2026-09-13T11:00:00.000Z"),
        },
        now
      )
    ).toBe(true);
    expect(
      isActiveSupportAssignment(
        {
          status: "REVOKED",
          validFrom: new Date("2026-09-13T09:00:00.000Z"),
          validTo: null,
        },
        now
      )
    ).toBe(false);
  });

  it("allows a global permission or a valid scoped assignment", () => {
    expect(canUseQueue({ hasGlobalPermission: true, assignment: null, now })).toBe(true);
    expect(canUseQueue({ hasGlobalPermission: false, assignment: null, now })).toBe(false);
    expect(
      canUseQueue({
        hasGlobalPermission: false,
        assignment: { status: "ACTIVE", validFrom: now, validTo: null },
        now,
      })
    ).toBe(true);
  });
});
