import { getDeploymentVersion } from "@/lib/deployment-config";
import { checkReadiness } from "@/lib/health-service";
import {
  getReportingRolloutConfig,
  type ReportingRolloutStage,
} from "@/lib/reporting-rollout-config";

export interface RuntimeMetricsSnapshot {
  deploymentVersion: string;
  ready: boolean;
  uptimeSeconds: number;
  residentMemoryBytes: number;
  heapUsedBytes: number;
  reportingRolloutStage: ReportingRolloutStage;
  reportingProjectionEnabled: boolean;
  reportingApiEnabled: boolean;
}

function metricBoolean(value: boolean): number {
  return value ? 1 : 0;
}

export function renderPrometheusMetrics(
  snapshot: RuntimeMetricsSnapshot
): string {
  return [
    "# HELP ticketing_build_info Immutable application release information.",
    "# TYPE ticketing_build_info gauge",
    `ticketing_build_info{version="${snapshot.deploymentVersion}"} 1`,
    "# HELP ticketing_ready Whether runtime configuration and database checks pass.",
    "# TYPE ticketing_ready gauge",
    `ticketing_ready ${metricBoolean(snapshot.ready)}`,
    "# HELP ticketing_reporting_rollout_stage Active Reporting rollout stage.",
    "# TYPE ticketing_reporting_rollout_stage gauge",
    `ticketing_reporting_rollout_stage{stage="${snapshot.reportingRolloutStage}"} 1`,
    "# HELP ticketing_reporting_projection_enabled Whether the Reporting projection is enabled.",
    "# TYPE ticketing_reporting_projection_enabled gauge",
    `ticketing_reporting_projection_enabled ${metricBoolean(snapshot.reportingProjectionEnabled)}`,
    "# HELP ticketing_reporting_api_enabled Whether the Reporting API is enabled.",
    "# TYPE ticketing_reporting_api_enabled gauge",
    `ticketing_reporting_api_enabled ${metricBoolean(snapshot.reportingApiEnabled)}`,
    "# HELP process_uptime_seconds Node.js process uptime in seconds.",
    "# TYPE process_uptime_seconds gauge",
    `process_uptime_seconds ${snapshot.uptimeSeconds}`,
    "# HELP process_resident_memory_bytes Resident memory size in bytes.",
    "# TYPE process_resident_memory_bytes gauge",
    `process_resident_memory_bytes ${snapshot.residentMemoryBytes}`,
    "# HELP nodejs_heap_used_bytes Node.js heap memory currently used in bytes.",
    "# TYPE nodejs_heap_used_bytes gauge",
    `nodejs_heap_used_bytes ${snapshot.heapUsedBytes}`,
    "",
  ].join("\n");
}

function safeDeploymentVersion(): string {
  try {
    return getDeploymentVersion();
  } catch {
    return "invalid";
  }
}

export async function collectRuntimeMetrics(requestUrl: string): Promise<string> {
  const readiness = await checkReadiness(requestUrl);
  const memory = process.memoryUsage();
  const reportingRollout = getReportingRolloutConfig();

  return renderPrometheusMetrics({
    deploymentVersion: safeDeploymentVersion(),
    ready: readiness.ready,
    uptimeSeconds: process.uptime(),
    residentMemoryBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    reportingRolloutStage: reportingRollout.stage,
    reportingProjectionEnabled: reportingRollout.projectionEnabled,
    reportingApiEnabled: reportingRollout.apiEnabled,
  });
}
