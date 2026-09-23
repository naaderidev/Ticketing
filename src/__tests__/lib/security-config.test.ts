import {
  getJwtSecret,
  getApplicationOrigin,
  getSecurityHashSecret,
  getTrustedProxyIpHeader,
  resetSecurityConfigForTests,
} from "@/lib/security-config";

describe("security configuration", () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalHashSecret = process.env.SECURITY_HASH_SECRET;
  const originalAppOrigin = process.env.APP_ORIGIN;
  const originalProxyHeader = process.env.TRUSTED_PROXY_IP_HEADER;
  const originalDemoMode = process.env.DEMO_MODE;
  const originalNodeEnvironment = process.env.NODE_ENV;

  function restoreEnvironmentVariable(
    name: string,
    value: string | undefined
  ): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  afterEach(() => {
    restoreEnvironmentVariable("JWT_SECRET", originalSecret);
    restoreEnvironmentVariable("SECURITY_HASH_SECRET", originalHashSecret);
    restoreEnvironmentVariable("APP_ORIGIN", originalAppOrigin);
    restoreEnvironmentVariable("TRUSTED_PROXY_IP_HEADER", originalProxyHeader);
    restoreEnvironmentVariable("DEMO_MODE", originalDemoMode);
    restoreEnvironmentVariable("NODE_ENV", originalNodeEnvironment);
    resetSecurityConfigForTests();
  });

  it("rejects a missing JWT secret", () => {
    delete process.env.JWT_SECRET;
    resetSecurityConfigForTests();

    expect(() => getJwtSecret()).toThrow("JWT_SECRET must be configured");
  });

  it("rejects known placeholder secrets", () => {
    process.env.JWT_SECRET = "replace_with_a_cryptographically_random_secret";
    resetSecurityConfigForTests();

    expect(() => getJwtSecret()).toThrow("JWT_SECRET must be configured");
  });

  it("accepts a sufficiently long non-placeholder secret", () => {
    process.env.JWT_SECRET = "a-valid-test-secret-with-more-than-32-characters";
    resetSecurityConfigForTests();

    expect(getJwtSecret().byteLength).toBeGreaterThanOrEqual(32);
  });

  it("requires a separate pseudonymization secret", () => {
    delete process.env.SECURITY_HASH_SECRET;
    resetSecurityConfigForTests();

    expect(() => getSecurityHashSecret()).toThrow(
      "SECURITY_HASH_SECRET must be configured"
    );
  });

  it("normalizes a configured application origin", () => {
    process.env.APP_ORIGIN = "https://tickets.example.com/";
    expect(getApplicationOrigin("http://internal:3000/path")).toBe(
      "https://tickets.example.com"
    );
  });

  it("allows the configured HTTP origin in an explicitly enabled production demo", () => {
    process.env = {
      ...process.env,
      NODE_ENV: "production",
      DEMO_MODE: "true",
      APP_ORIGIN: "http://172.20.40.214:3009",
    };

    expect(getApplicationOrigin("http://internal:3000/path")).toBe(
      "http://172.20.40.214:3009"
    );
    expect(getTrustedProxyIpHeader()).toBeNull();
  });

  it("only accepts allow-listed trusted proxy headers", () => {
    process.env.TRUSTED_PROXY_IP_HEADER = "authorization";
    expect(() => getTrustedProxyIpHeader()).toThrow("is not supported");
  });
});
