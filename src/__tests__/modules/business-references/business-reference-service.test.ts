import { verifyBusinessReferences } from "@/modules/business-references/application/business-reference-service";
import type { BusinessReferenceProvider } from "@/modules/business-references/application/business-reference-provider";

const context = {
  partyId: 7,
  type: "ORGANIZATION" as const,
  displayName: "شرکت نمونه",
  organization: {
    id: 3,
    legalName: "شرکت نمونه",
    membershipId: 11,
    role: "REPRESENTATIVE" as const,
    scopes: [{ type: "CONTRACT" as const, scopeKey: "*" }],
  },
};

function providerWithItems(
  items: Awaited<ReturnType<BusinessReferenceProvider["verify"]>>
): BusinessReferenceProvider {
  return {
    search: jest.fn(),
    verify: jest.fn().mockResolvedValue(items),
  };
}

describe("business reference verification", () => {
  it("returns only the minimal verified snapshot", async () => {
    const provider = providerWithItems([
      {
        sourceSystem: "CONTRACT_CORE",
        entityType: "CONTRACT",
        externalId: "CTR-100",
        displayLabel: "قرارداد ••••۱۰۰",
        snapshotAt: new Date().toISOString(),
        sourceVersion: "17",
        etag: "contract-17",
        authorized: true,
      },
    ]);

    await expect(
      verifyBusinessReferences({
        context,
        subjectType: "CONTRACT",
        externalIds: ["CTR-100"],
        requestId: "951fd209-d275-4402-a91f-f94306e76dd0",
        provider,
      })
    ).resolves.toEqual([
      expect.objectContaining({
        sourceSystem: "CONTRACT_CORE",
        entityType: "CONTRACT",
        externalId: "CTR-100",
        sourceVersion: "17",
      }),
    ]);
  });

  it("fails closed when a requested identifier is missing or unauthorized", async () => {
    const provider = providerWithItems([]);
    await expect(
      verifyBusinessReferences({
        context,
        subjectType: "CONTRACT",
        externalIds: ["CTR-OUTSIDE-SCOPE"],
        requestId: "951fd209-d275-4402-a91f-f94306e76dd0",
        provider,
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects expired snapshots", async () => {
    const provider = providerWithItems([
      {
        sourceSystem: "CONTRACT_CORE",
        entityType: "CONTRACT",
        externalId: "CTR-100",
        displayLabel: "قرارداد ••••۱۰۰",
        snapshotAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-02T00:00:00.000Z",
        authorized: true,
      },
    ]);
    await expect(
      verifyBusinessReferences({
        context,
        subjectType: "CONTRACT",
        externalIds: ["CTR-100"],
        requestId: "951fd209-d275-4402-a91f-f94306e76dd0",
        provider,
      })
    ).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
});
