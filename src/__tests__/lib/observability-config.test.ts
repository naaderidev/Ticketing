import { getMetricsToken } from "@/lib/observability-config";

describe("observability configuration", () => {
  const originalMetricsToken = process.env.METRICS_TOKEN;

  afterEach(() => {
    if (originalMetricsToken === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = originalMetricsToken;
  });

  it("requires a dedicated metrics credential", () => {
    delete process.env.METRICS_TOKEN;

    expect(() => getMetricsToken()).toThrow(
      "METRICS_TOKEN must contain at least 32 non-placeholder characters"
    );
  });

  it("rejects a placeholder credential", () => {
    process.env.METRICS_TOKEN =
      "replace_with_a_separate_random_32_character_metrics_token";

    expect(() => getMetricsToken()).toThrow("non-placeholder");
  });

  it("accepts a sufficiently long independent credential", () => {
    process.env.METRICS_TOKEN =
      "metrics-only-test-token-with-at-least-32-characters";

    expect(getMetricsToken()).toBe(process.env.METRICS_TOKEN);
  });
});
