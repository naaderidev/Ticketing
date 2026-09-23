import { getRequestId } from "@/lib/request-security";

describe("request correlation", () => {
  it("keeps one generated request id stable across response and audit calls", () => {
    const request = new Request("http://localhost/api/test");
    expect(getRequestId(request)).toBe(getRequestId(request));
    expect(getRequestId(request)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("preserves a valid ingress request id", () => {
    const requestId = "951fd209-d275-4402-a91f-f94306e76dd0";
    const request = new Request("http://localhost/api/test", {
      headers: { "x-request-id": requestId },
    });
    expect(getRequestId(request)).toBe(requestId);
  });
});
