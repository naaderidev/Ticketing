import { verifyToken } from "@/lib/auth-token";
import { config, proxy } from "@/proxy";

jest.mock("@/lib/auth-token", () => ({
  verifyToken: jest.fn(),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    next: jest.fn((init) => ({
      kind: "next",
      status: 200,
      headers: new Headers(),
      requestHeaders: init?.request?.headers,
    })),
    redirect: jest.fn((url) => ({
      kind: "redirect",
      status: 307,
      url: url.toString(),
      headers: new Headers(),
    })),
    json: jest.fn((body, init) => ({
      kind: "json",
      status: init?.status || 200,
      body,
      headers: new Headers(init?.headers),
    })),
  },
}));

function createRequest(
  pathname: string,
  token?: string,
  init: {
    method?: string;
    origin?: string;
    fetchSite?: string;
    requestId?: string;
  } = {}
) {
  const url = new URL("http://localhost" + pathname);
  return {
    url: url.toString(),
    method: init.method ?? "GET",
    headers: new Headers({
      ...(init.origin ? { origin: init.origin } : {}),
      ...(init.fetchSite ? { "sec-fetch-site": init.fetchSite } : {}),
      ...(init.requestId ? { "x-request-id": init.requestId } : {}),
    }),
    nextUrl: {
      pathname: url.pathname,
      clone: () => new URL(url),
    },
    cookies: {
      get: () => (token ? { value: token } : undefined),
    },
  } as never;
}

describe("route proxy", () => {
  it("covers the public landing page for request correlation", () => {
    expect(config.matcher).toContain("/");
  });

  it("redirects an anonymous protected page to login", async () => {
    const response = await proxy(createRequest("/admin/tickets"));

    expect(response).toMatchObject({ kind: "redirect", status: 307 });
    expect((response as unknown as { url: string }).url).toContain(
      "/user/login?redirect=%2Fadmin%2Ftickets"
    );
  });

  it("allows an anonymous public user page", async () => {
    const response = await proxy(createRequest("/user/signup"));

    expect(response).toMatchObject({ kind: "next", status: 200 });
  });

  it("forwards and returns a valid request correlation id", async () => {
    const requestId = "123e4567-e89b-42d3-a456-426614174000";
    const response = (await proxy(
      createRequest("/api/health/live", undefined, { requestId })
    )) as unknown as {
      headers: Headers;
      requestHeaders: Headers;
    };

    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.requestHeaders.get("x-request-id")).toBe(requestId);
  });

  it("replaces an invalid request correlation id", async () => {
    const response = (await proxy(
      createRequest("/api/health/live", undefined, {
        requestId: "not-a-valid-id",
      })
    )) as unknown as {
      headers: Headers;
      requestHeaders: Headers;
    };
    const generatedId = response.headers.get("x-request-id");

    expect(generatedId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(response.requestHeaders.get("x-request-id")).toBe(generatedId);
  });

  it("rejects an anonymous protected API", async () => {
    const response = await proxy(createRequest("/api/tickets"));

    expect(response).toMatchObject({ kind: "json", status: 401 });
  });

  it("blocks direct access to legacy public uploads", async () => {
    const response = await proxy(createRequest("/uploads/legacy.pdf", "token"));

    expect(response).toMatchObject({ kind: "json", status: 404 });
  });

  it("allows a protected path with a valid session", async () => {
    (verifyToken as jest.Mock).mockResolvedValueOnce({
      userId: 1,
      sessionId: "4f1cd431-0dbf-4c2d-854c-1de9d6058208",
    });

    const response = await proxy(createRequest("/api/tickets", "token"));

    expect(response).toMatchObject({ kind: "next", status: 200 });
  });

  it("rejects a cross-site mutation before trusting the session", async () => {
    const response = await proxy(
      createRequest("/api/tickets", "token", {
        method: "POST",
        origin: "https://evil.example",
        fetchSite: "cross-site",
      })
    );

    expect(response).toMatchObject({ kind: "json", status: 403 });
    expect(verifyToken).not.toHaveBeenCalled();
  });
});
