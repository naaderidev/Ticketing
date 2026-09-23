import { resolveBusinessReferenceIntegrationConfig } from "@/lib/business-reference-integration-config";

const baseEnvironment = {
  NODE_ENV: "production",
  BUSINESS_REFERENCE_PROVIDER_URL: "https://references.example.com/gateway/",
  BUSINESS_REFERENCE_PROVIDER_TOKEN:
    "provider-token-with-at-least-thirty-two-characters",
  BUSINESS_REFERENCE_PROVIDER_CONTRACT_VERSION: "v1",
  BUSINESS_REFERENCE_PROVIDER_SUBJECT_TYPES: "CONTRACT,INVOICE",
};

describe("business reference integration configuration", () => {
  it("normalizes an approved bounded configuration", () => {
    const config = resolveBusinessReferenceIntegrationConfig(baseEnvironment);
    expect(config.baseUrl).toBe("https://references.example.com/gateway/");
    expect(config.timeoutMs).toBe(2_000);
    expect([...config.enabledSubjectTypes]).toEqual(["CONTRACT", "INVOICE"]);
  });

  it("requires HTTPS in production and rejects URL credentials", () => {
    expect(() =>
      resolveBusinessReferenceIntegrationConfig({
        ...baseEnvironment,
        BUSINESS_REFERENCE_PROVIDER_URL: "http://references.example.com",
      })
    ).toThrow("HTTPS");
    expect(() =>
      resolveBusinessReferenceIntegrationConfig({
        ...baseEnvironment,
        BUSINESS_REFERENCE_PROVIDER_URL: "https://user:pass@example.com",
      })
    ).toThrow("unsupported URL components");
  });

  it("rejects weak credentials, unsupported subjects and unsafe timeouts", () => {
    expect(() =>
      resolveBusinessReferenceIntegrationConfig({
        ...baseEnvironment,
        BUSINESS_REFERENCE_PROVIDER_TOKEN: "short",
      })
    ).toThrow("TOKEN");
    expect(() =>
      resolveBusinessReferenceIntegrationConfig({
        ...baseEnvironment,
        BUSINESS_REFERENCE_PROVIDER_TOKEN:
          "replace_with_a_separate_random_32_character_provider_token",
      })
    ).toThrow("TOKEN");
    expect(() =>
      resolveBusinessReferenceIntegrationConfig({
        ...baseEnvironment,
        BUSINESS_REFERENCE_PROVIDER_SUBJECT_TYPES: "CONTRACT,UNKNOWN",
      })
    ).toThrow("SUBJECT_TYPES");
    expect(() =>
      resolveBusinessReferenceIntegrationConfig({
        ...baseEnvironment,
        BUSINESS_REFERENCE_PROVIDER_TIMEOUT_MS: "10001",
      })
    ).toThrow("TIMEOUT_MS");
  });
});
