import { DemoBusinessReferenceProvider } from "@/modules/business-references/infrastructure/demo-business-reference-provider";

const provider = new DemoBusinessReferenceProvider();

describe("demo business reference provider", () => {
  it("returns personal demo references for local presentation", async () => {
    const items = await provider.search({
      requestId: "request-1",
      subjectType: "PAYMENT",
      context: {
        partyId: 8,
        organizationId: null,
        scopes: [],
        contextToken: "a".repeat(64),
      },
      query: "PAY",
      limit: 10,
    });

    expect(items).toEqual([
      expect.objectContaining({
        externalId: "PAY-DEMO-1405-001",
        authorized: true,
      }),
    ]);
  });

  it("enforces representative contract scope", async () => {
    const items = await provider.verify({
      requestId: "request-2",
      subjectType: "CONTRACT",
      context: {
        partyId: 20,
        organizationId: 3,
        scopes: [{ type: "CONTRACT", key: "CTR-DEMO-1405-001" }],
        contextToken: "b".repeat(64),
      },
      externalIds: ["CTR-DEMO-1405-001", "CTR-DEMO-1405-002"],
    });

    expect(items.map((item) => [item.externalId, item.authorized])).toEqual([
      ["CTR-DEMO-1405-001", true],
      ["CTR-DEMO-1405-002", false],
    ]);
  });
});
