import {
  assignSupportTeamMemberSchema,
  createSupportRequestTypeSchema,
  createSupportServiceSchema,
  reconcileLegacyCatalogMappingSchema,
} from "@/modules/support-catalog/contracts/support-catalog-schemas";

describe("support catalog API contracts", () => {
  it("normalizes a valid service and rejects client-controlled fields", () => {
    expect(
      createSupportServiceSchema.parse({ code: " FINANCE ", name: " مالی ", sortOrder: 0 })
    ).toMatchObject({ code: "FINANCE", name: "مالی" });
    expect(
      createSupportServiceSchema.safeParse({
        code: "FINANCE",
        name: "مالی",
        sortOrder: 0,
        status: "ACTIVE",
      }).success
    ).toBe(false);
  });

  it("requires a subject type when the request type declares it mandatory", () => {
    expect(
      createSupportRequestTypeSchema.safeParse({
        serviceId: 1,
        queueId: 1,
        code: "PAYMENT",
        name: "پرداخت",
        requiresBusinessSubject: true,
        requiresRootCause: false,
        sortOrder: 0,
        defaultPriority: "NORMAL",
      }).success
    ).toBe(false);
  });

  it("limits team assignment roles and mapping outcomes", () => {
    expect(
      assignSupportTeamMemberSchema.safeParse({ userId: 2, roleKey: "SYSTEM_ADMINISTRATOR" }).success
    ).toBe(false);
    expect(
      reconcileLegacyCatalogMappingSchema.safeParse({ status: "PENDING" }).success
    ).toBe(false);
  });
});
