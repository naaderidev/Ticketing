import { hasValidMetricsToken } from "@/lib/metrics-auth";

describe("metrics authentication", () => {
  const originalMetricsToken = process.env.METRICS_TOKEN;

  beforeAll(() => {
    process.env.METRICS_TOKEN =
      "metrics-only-test-token-with-at-least-32-characters";
  });

  afterAll(() => {
    if (originalMetricsToken === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = originalMetricsToken;
  });

  it("rejects requests without bearer authentication", () => {
    expect(hasValidMetricsToken(new Request("http://localhost"))).toBe(false);
  });

  it("rejects an incorrect credential", () => {
    const request = new Request("http://localhost", {
      headers: { Authorization: "Bearer wrong-token" },
    });

    expect(hasValidMetricsToken(request)).toBe(false);
  });

  it("accepts the dedicated metrics credential", () => {
    const request = new Request("http://localhost", {
      headers: {
        Authorization:
          "Bearer metrics-only-test-token-with-at-least-32-characters",
      },
    });

    expect(hasValidMetricsToken(request)).toBe(true);
  });
});
