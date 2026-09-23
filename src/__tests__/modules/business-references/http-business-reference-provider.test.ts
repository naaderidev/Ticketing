import type { BusinessReferenceIntegrationConfig } from "@/lib/business-reference-integration-config";
import { HttpBusinessReferenceProvider } from "@/modules/business-references/infrastructure/http-business-reference-provider";

const config: BusinessReferenceIntegrationConfig = {
  baseUrl: "https://references.example.com/gateway/",
  token: "provider-token-with-at-least-thirty-two-characters",
  contractVersion: "v1",
  timeoutMs: 2_000,
  enabledSubjectTypes: new Set(["CONTRACT"]),
};

const request = {
  requestId: "951fd209-d275-4402-a91f-f94306e76dd0",
  subjectType: "CONTRACT" as const,
  context: {
    partyId: 7,
    organizationId: 3,
    scopes: [{ type: "CONTRACT", key: "*" }],
    contextToken: "a".repeat(64),
  },
  externalIds: ["CTR-100"],
};

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-length": "200" }),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

describe("HTTP business reference provider", () => {
  it("uses a fixed server URL and accepts a context-bound contract response", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(
      response({
        contractVersion: "v1",
        contextToken: request.context.contextToken,
        subjectType: "CONTRACT",
        items: [
          {
            sourceSystem: "CONTRACT_CORE",
            entityType: "CONTRACT",
            externalId: "CTR-100",
            displayLabel: "قرارداد ••••۱۰۰",
            snapshotAt: "2026-09-13T06:00:00.000Z",
            expiresAt: "2026-09-14T06:00:00.000Z",
            sourceVersion: "17",
            etag: "contract-17",
            authorized: true,
          },
        ],
      })
    ) as unknown as typeof fetch;
    const provider = new HttpBusinessReferenceProvider(
      config,
      fetchImplementation
    );

    await expect(provider.verify(request)).resolves.toHaveLength(1);
    expect(fetchImplementation).toHaveBeenCalledWith(
      new URL("https://references.example.com/gateway/v1/business-references/verify"),
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: `Bearer ${config.token}`,
          "x-contract-version": "v1",
        }),
      })
    );
  });

  it("rejects a response bound to another context", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(
      response({
        contractVersion: "v1",
        contextToken: "b".repeat(64),
        subjectType: "CONTRACT",
        items: [],
      })
    ) as unknown as typeof fetch;
    const provider = new HttpBusinessReferenceProvider(
      config,
      fetchImplementation
    );

    await expect(provider.verify(request)).rejects.toMatchObject({
      code: "UPSTREAM_INVALID_RESPONSE",
      status: 502,
    });
  });

  it("maps provider overload and network failures to a safe 503", async () => {
    const overloaded = new HttpBusinessReferenceProvider(
      config,
      jest.fn().mockResolvedValue(response({}, 429)) as unknown as typeof fetch
    );
    const offline = new HttpBusinessReferenceProvider(
      config,
      jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED secret-host")) as unknown as typeof fetch
    );

    await expect(overloaded.verify(request)).rejects.toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
      status: 503,
    });
    await expect(offline.verify(request)).rejects.toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
      status: 503,
      message: expect.not.stringContaining("secret-host"),
    });
  });
});
