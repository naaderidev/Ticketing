import { renderPrometheusMetrics } from "@/lib/runtime-metrics";

describe("runtime metrics", () => {
  it("renders deterministic Prometheus gauges without sensitive data", () => {
    const metrics = renderPrometheusMetrics({
      deploymentVersion: "commit-abc123",
      ready: true,
      uptimeSeconds: 42.5,
      residentMemoryBytes: 1000,
      heapUsedBytes: 500,
      reportingRolloutStage: "CANARY",
      reportingProjectionEnabled: true,
      reportingApiEnabled: true,
    });

    expect(metrics).toContain(
      'ticketing_build_info{version="commit-abc123"} 1'
    );
    expect(metrics).toContain("ticketing_ready 1");
    expect(metrics).toContain("process_uptime_seconds 42.5");
    expect(metrics).toContain("process_resident_memory_bytes 1000");
    expect(metrics).toContain("nodejs_heap_used_bytes 500");
    expect(metrics).toContain(
      'ticketing_reporting_rollout_stage{stage="CANARY"} 1'
    );
    expect(metrics).toContain("ticketing_reporting_projection_enabled 1");
    expect(metrics).toContain("ticketing_reporting_api_enabled 1");
    expect(metrics).not.toContain("token");
  });

  it("reports an unavailable instance as zero", () => {
    const metrics = renderPrometheusMetrics({
      deploymentVersion: "commit-abc123",
      ready: false,
      uptimeSeconds: 1,
      residentMemoryBytes: 1,
      heapUsedBytes: 1,
      reportingRolloutStage: "DISABLED",
      reportingProjectionEnabled: false,
      reportingApiEnabled: false,
    });

    expect(metrics).toContain("ticketing_ready 0");
    expect(metrics).toContain("ticketing_reporting_projection_enabled 0");
    expect(metrics).toContain("ticketing_reporting_api_enabled 0");
  });
});
