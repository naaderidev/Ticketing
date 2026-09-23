import type { SlaTargetState } from "@prisma/client";
import { buildTimeSlaReport } from "@/modules/reporting/application/time-sla-report-service";
import { resolveReportingFreshness } from "@/modules/reporting/domain/reporting-freshness";

const from = new Date("2026-09-01T00:00:00.000Z");
const to = new Date("2026-10-01T00:00:00.000Z");
const asOf = new Date("2026-09-15T12:00:00.000Z");

function row(overrides: Partial<{
  dataQualityStatus: "HEALTHY" | "INCOMPLETE" | "EXCLUDED";
  exclusionReason: string | null;
  legacyImported: boolean;
  firstHumanPublicResponseAt: Date | null;
  firstResponseEffectiveMilliseconds: bigint | null;
  firstResolvedAt: Date | null;
  resolutionEffectiveMilliseconds: bigint | null;
  firstResponseSlaState: SlaTargetState | null;
  resolutionSlaState: SlaTargetState | null;
}> = {}) {
  return {
    dataQualityStatus: "HEALTHY" as const,
    exclusionReason: null,
    legacyImported: false,
    firstHumanPublicResponseAt: new Date("2026-09-02T08:30:00.000Z"),
    firstResponseEffectiveMilliseconds: BigInt(30 * 60_000),
    firstResolvedAt: new Date("2026-09-02T10:00:00.000Z"),
    resolutionEffectiveMilliseconds: BigInt(120 * 60_000),
    firstResponseSlaState: "MET" as SlaTargetState,
    resolutionSlaState: "MET" as SlaTargetState,
    ...overrides,
  };
}

const fresh = {
  status: "FRESH" as const,
  reason: null,
  projectionLagSeconds: 0,
  lastProjectedEventAt: "2026-09-15T11:59:00.000Z",
  lastProcessedAt: "2026-09-15T11:59:01.000Z",
};

describe("time, resolution and SLA KPI-V1 report", () => {
  it("implements the acceptance examples and keeps pending/excluded outside durations", () => {
    const firstResponseDueRows = Array.from({ length: 100 }, (_, index) =>
      row({ firstResponseSlaState: index < 80 ? "MET" : "BREACHED" })
    );
    const report = buildTimeSlaReport({
      definitionVersion: "KPI-V1",
      asOf,
      range: { from, to },
      scope: { type: "GLOBAL", accessMode: "MANAGEMENT", teamIds: null },
      freshness: fresh,
      creationRows: [
        row(),
        row({
          firstHumanPublicResponseAt: null,
          firstResponseEffectiveMilliseconds: null,
          firstResponseSlaState: "PENDING",
        }),
        row({
          dataQualityStatus: "EXCLUDED",
          exclusionReason: "HISTORICAL_INCOMPLETE",
        }),
      ],
      resolutionRows: [row()],
      firstResponseDueRows,
      resolutionDueRows: [row()],
    });

    expect(report.firstResponseTime).toMatchObject({
      value: {
        averageMilliseconds: 1_800_000,
        medianMilliseconds: 1_800_000,
        p90Milliseconds: 1_800_000,
      },
      respondedCount: 1,
      pendingCount: 1,
      excludedCount: 1,
    });
    expect(report.resolutionTime.value).toEqual({
      averageMilliseconds: 7_200_000,
      medianMilliseconds: 7_200_000,
      p90Milliseconds: 7_200_000,
    });
    expect(report.slaCompliance.firstResponse).toMatchObject({
      percentage: 80,
      metCount: 80,
      breachedCount: 20,
      sampleCount: 100,
    });
    expect(report.slaCompliance.combined.percentage).toBe(100);
    expect(report.dataQuality).toMatchObject({
      eligibleCount: 2,
      excludedCount: 1,
      legacyCount: 0,
    });
  });

  it("returns machine-readable nulls instead of fabricated zero values", () => {
    const report = buildTimeSlaReport({
      definitionVersion: "KPI-V1",
      asOf,
      range: { from, to },
      scope: { type: "GLOBAL", accessMode: "AUDIT", teamIds: null },
      freshness: fresh,
      creationRows: [],
      resolutionRows: [],
      firstResponseDueRows: [],
      resolutionDueRows: [],
    });

    expect(report.firstResponseTime).toMatchObject({
      value: null,
      reason: "NO_ELIGIBLE_DATA",
      sampleCount: 0,
    });
    expect(report.resolutionTime.value).toBeNull();
    expect(report.slaCompliance.firstResponse).toMatchObject({
      percentage: null,
      reason: "ZERO_DENOMINATOR",
    });
  });

  it("suppresses KPI values when projection freshness is unavailable", () => {
    const unavailable = {
      ...fresh,
      status: "UNAVAILABLE" as const,
      reason: "PROJECTION_LAG_EXCEEDED" as const,
      projectionLagSeconds: 901,
    };
    const report = buildTimeSlaReport({
      definitionVersion: "KPI-V1",
      asOf,
      range: { from, to },
      scope: { type: "TEAMS", accessMode: "MANAGEMENT", teamIds: [3] },
      freshness: unavailable,
      creationRows: [row()],
      resolutionRows: [row()],
      firstResponseDueRows: [row()],
      resolutionDueRows: [row()],
    });

    expect(report.firstResponseTime).toMatchObject({
      value: null,
      reason: "PROJECTION_UNAVAILABLE",
      sampleCount: 1,
    });
    expect(report.slaCompliance.resolution).toMatchObject({
      percentage: null,
      reason: "PROJECTION_UNAVAILABLE",
      sampleCount: 1,
    });
  });
});

describe("reporting projection freshness", () => {
  const checkpoint = {
    definitionVersion: "KPI-V1",
    status: "HEALTHY" as const,
    lastOutboxEventId: BigInt(10),
    lastEventOccurredAt: new Date("2026-09-15T11:50:00.000Z"),
    lastProcessedAt: new Date("2026-09-15T11:50:01.000Z"),
  };

  it.each([
    [300, "FRESH"],
    [301, "STALE"],
    [900, "STALE"],
    [901, "UNAVAILABLE"],
  ] as const)("maps a %s second backlog to %s", (lagSeconds, status) => {
    const freshness = resolveReportingFreshness(
      {
        definitionVersion: "KPI-V1",
        checkpoint,
        oldestPendingEvent: {
          occurredAt: new Date(asOf.getTime() - lagSeconds * 1_000),
        },
      },
      asOf
    );
    expect(freshness.status).toBe(status);
    expect(freshness.projectionLagSeconds).toBe(lagSeconds);
  });

  it("fails closed for a missing checkpoint or definition mismatch", () => {
    expect(
      resolveReportingFreshness(
        {
          definitionVersion: "KPI-V1",
          checkpoint: null,
          oldestPendingEvent: null,
        },
        asOf
      )
    ).toMatchObject({ status: "UNAVAILABLE", reason: "CHECKPOINT_MISSING" });
    expect(
      resolveReportingFreshness(
        {
          definitionVersion: "KPI-V2",
          checkpoint,
          oldestPendingEvent: null,
        },
        asOf
      )
    ).toMatchObject({
      status: "UNAVAILABLE",
      reason: "DEFINITION_VERSION_MISMATCH",
    });
  });
});
