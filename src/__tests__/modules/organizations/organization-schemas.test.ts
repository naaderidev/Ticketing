import {
  activePartyContextSchema,
  createOrganizationSchema,
  organizationAccessRequestSchema,
} from "@/modules/organizations/contracts/organization-schemas";

describe("organization API contracts", () => {
  it("rejects client-controlled fields outside the contract", () => {
    const result = createOrganizationSchema.safeParse({
      legalName: "شرکت آزمون",
      nationalId: "10101234567",
      managerUserId: 2,
      status: "ACTIVE",
    });
    expect(result.success).toBe(false);
  });

  it("requires a role and scope when adding a representative", () => {
    const result = organizationAccessRequestSchema.safeParse({
      targetUserId: 2,
      requestType: "ADD_MEMBERSHIP",
      reason: "افزودن نماینده شرکت",
      scopes: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate and unsafe scope keys", () => {
    const duplicate = organizationAccessRequestSchema.safeParse({
      targetUserId: 2,
      requestType: "ADD_MEMBERSHIP",
      requestedRole: "REPRESENTATIVE",
      reason: "افزودن نماینده شرکت",
      scopes: [
        { type: "BRANCH", scopeKey: "branch:1" },
        { type: "BRANCH", scopeKey: "branch:1" },
      ],
    });
    const unsafe = organizationAccessRequestSchema.safeParse({
      targetUserId: 2,
      requestType: "ADD_MEMBERSHIP",
      requestedRole: "REPRESENTATIVE",
      reason: "افزودن نماینده شرکت",
      scopes: [{ type: "BRANCH", scopeKey: "../branch/1" }],
    });
    expect(duplicate.success).toBe(false);
    expect(unsafe.success).toBe(false);
  });

  it("accepts only a positive numeric party id", () => {
    expect(activePartyContextSchema.safeParse({ partyId: 1 }).success).toBe(true);
    expect(activePartyContextSchema.safeParse({ partyId: 0 }).success).toBe(false);
  });
});
