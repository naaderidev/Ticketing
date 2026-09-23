import type { ReportingProjectionStatus } from "@prisma/client";

const FRESHNESS_STALE_SECONDS = 5 * 60;
const FRESHNESS_UNAVAILABLE_SECONDS = 15 * 60;

export type ReportingProjectionSnapshot = {
  definitionVersion: string;
  checkpoint: {
    definitionVersion: string;
    status: ReportingProjectionStatus;
    lastOutboxEventId: bigint | null;
    lastEventOccurredAt: Date | null;
    lastProcessedAt: Date | null;
  } | null;
  oldestPendingEvent: { occurredAt: Date } | null;
};

export type ReportingFreshness = {
  status: "FRESH" | "STALE" | "UNAVAILABLE";
  reason:
    | null
    | "CHECKPOINT_MISSING"
    | "DEFINITION_VERSION_MISMATCH"
    | "PROJECTION_FAILED"
    | "PROJECTION_REBUILDING"
    | "PROJECTION_STATUS_UNAVAILABLE"
    | "PROJECTION_LAG_EXCEEDED";
  projectionLagSeconds: number | null;
  lastProjectedEventAt: string | null;
  lastProcessedAt: string | null;
};

export function resolveReportingFreshness(
  snapshot: ReportingProjectionSnapshot,
  asOf: Date
): ReportingFreshness {
  const checkpoint = snapshot.checkpoint;
  if (!checkpoint) {
    return {
      status: "UNAVAILABLE",
      reason: "CHECKPOINT_MISSING",
      projectionLagSeconds: null,
      lastProjectedEventAt: null,
      lastProcessedAt: null,
    };
  }

  const common = {
    lastProjectedEventAt: checkpoint.lastEventOccurredAt?.toISOString() ?? null,
    lastProcessedAt: checkpoint.lastProcessedAt?.toISOString() ?? null,
  };
  const lagSeconds = snapshot.oldestPendingEvent
    ? Math.max(
        0,
        Math.floor(
          (asOf.getTime() - snapshot.oldestPendingEvent.occurredAt.getTime()) /
            1_000
        )
      )
    : 0;

  if (checkpoint.definitionVersion !== snapshot.definitionVersion) {
    return {
      ...common,
      status: "UNAVAILABLE",
      reason: "DEFINITION_VERSION_MISMATCH",
      projectionLagSeconds: lagSeconds,
    };
  }
  if (checkpoint.status === "FAILED") {
    return {
      ...common,
      status: "UNAVAILABLE",
      reason: "PROJECTION_FAILED",
      projectionLagSeconds: lagSeconds,
    };
  }
  if (checkpoint.status === "REBUILDING") {
    return {
      ...common,
      status: "UNAVAILABLE",
      reason: "PROJECTION_REBUILDING",
      projectionLagSeconds: lagSeconds,
    };
  }
  if (checkpoint.status === "UNAVAILABLE") {
    return {
      ...common,
      status: "UNAVAILABLE",
      reason: "PROJECTION_STATUS_UNAVAILABLE",
      projectionLagSeconds: lagSeconds,
    };
  }
  if (lagSeconds > FRESHNESS_UNAVAILABLE_SECONDS) {
    return {
      ...common,
      status: "UNAVAILABLE",
      reason: "PROJECTION_LAG_EXCEEDED",
      projectionLagSeconds: lagSeconds,
    };
  }
  if (checkpoint.status === "STALE" || lagSeconds > FRESHNESS_STALE_SECONDS) {
    return {
      ...common,
      status: "STALE",
      reason: "PROJECTION_LAG_EXCEEDED",
      projectionLagSeconds: lagSeconds,
    };
  }
  return {
    ...common,
    status: "FRESH",
    reason: null,
    projectionLagSeconds: lagSeconds,
  };
}
