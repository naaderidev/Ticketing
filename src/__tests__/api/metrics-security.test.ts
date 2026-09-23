import { GET } from "@/app/api/internal/metrics/route";
import { hasValidMetricsToken } from "@/lib/metrics-auth";
import { collectRuntimeMetrics } from "@/lib/runtime-metrics";

jest.mock("@/lib/metrics-auth", () => ({
  hasValidMetricsToken: jest.fn(),
}));

jest.mock("@/lib/runtime-metrics", () => ({
  collectRuntimeMetrics: jest.fn(),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({
      status: init?.status || 200,
      body,
      headers: new Headers(init?.headers),
    })),
  },
}));

describe("internal metrics endpoint", () => {
  it("does not collect metrics without the dedicated credential", async () => {
    (hasValidMetricsToken as jest.Mock).mockReturnValue(false);

    const response = await GET(new Request("http://localhost/api/internal/metrics"));

    expect(response.status).toBe(401);
    expect(collectRuntimeMetrics).not.toHaveBeenCalled();
  });

  it("returns non-cacheable Prometheus output after authentication", async () => {
    (hasValidMetricsToken as jest.Mock).mockReturnValue(true);
    (collectRuntimeMetrics as jest.Mock).mockResolvedValue("ticketing_ready 1\n");

    const response = await GET(new Request("http://localhost/api/internal/metrics"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(response.headers.get("Content-Type")).toContain("text/plain");
  });
});
