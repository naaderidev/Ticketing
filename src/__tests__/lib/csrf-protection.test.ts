import {
  isTrustedMutationRequest,
  requiresCsrfProtection,
} from "@/lib/csrf-protection";

describe("CSRF protection", () => {
  const originalAppOrigin = process.env.APP_ORIGIN;
  const originalDemoMode = process.env.DEMO_MODE;
  const originalNodeEnvironment = process.env.NODE_ENV;

  afterEach(() => {
    if (originalAppOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = originalAppOrigin;
    if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = originalDemoMode;
    process.env = { ...process.env, NODE_ENV: originalNodeEnvironment };
  });

  it("requires protection for non-internal API mutations", () => {
    expect(requiresCsrfProtection("POST", "/api/tickets")).toBe(true);
    expect(requiresCsrfProtection("GET", "/api/tickets")).toBe(false);
    expect(
      requiresCsrfProtection("POST", "/api/internal/attachments/cleanup")
    ).toBe(false);
  });

  it("accepts a same-origin mutation", () => {
    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { origin: "http://localhost", "sec-fetch-site": "same-origin" },
    });

    expect(isTrustedMutationRequest(request)).toBe(true);
  });

  it("accepts the configured HTTP origin in production demo mode", () => {
    process.env = {
      ...process.env,
      NODE_ENV: "production",
      DEMO_MODE: "true",
      APP_ORIGIN: "http://172.20.40.214:3009",
    };
    const request = new Request(
      "http://app:3000/api/users/demo-login",
      {
        method: "POST",
        headers: {
          origin: "http://172.20.40.214:3009",
          "sec-fetch-site": "same-origin",
        },
      }
    );

    expect(isTrustedMutationRequest(request)).toBe(true);
  });

  it("accepts the active loopback origin when the development port changes", () => {
    process.env.APP_ORIGIN = "http://localhost:3000";
    const request = new Request("http://localhost:3001/api/users/login", {
      method: "POST",
      headers: {
        origin: "http://localhost:3001",
        "sec-fetch-site": "same-origin",
      },
    });

    expect(isTrustedMutationRequest(request)).toBe(true);
  });

  it("does not trust a different unconfigured loopback origin", () => {
    process.env.APP_ORIGIN = "http://localhost:3000";
    const request = new Request("http://localhost:3001/api/users/login", {
      method: "POST",
      headers: {
        origin: "http://localhost:3002",
        "sec-fetch-site": "same-site",
      },
    });

    expect(isTrustedMutationRequest(request)).toBe(false);
  });

  it("does not use the development fallback for non-loopback hosts", () => {
    process.env.APP_ORIGIN = "https://tickets.example.com";
    const request = new Request("https://preview.example.com/api/users/login", {
      method: "POST",
      headers: {
        origin: "https://preview.example.com",
        "sec-fetch-site": "same-origin",
      },
    });

    expect(isTrustedMutationRequest(request)).toBe(false);
  });

  it("rejects cross-site and origin-less mutations", () => {
    const crossSite = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    });
    const missingOrigin = new Request("http://localhost/api/tickets", {
      method: "POST",
    });

    expect(isTrustedMutationRequest(crossSite)).toBe(false);
    expect(isTrustedMutationRequest(missingOrigin)).toBe(false);
  });
});
