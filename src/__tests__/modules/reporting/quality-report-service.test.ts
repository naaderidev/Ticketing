import type {
  ReportingDataQualityStatus,
  ReportingFcrStatus,
} from "@prisma/client";
import { buildQualityReport } from "@/modules/reporting/application/quality-report-service";
import type { ReportingFreshness } from "@/modules/reporting/domain/reporting-freshness";

const from = new Date("2026-09-01T00:00:00.000Z");
const to = new Date("2026-10-01T00:00:00.000Z");
const asOf = new Date("2026-09-15T12:00:00.000Z");
const firstClosedAt = new Date("2026-09-01T10:00:00.000Z");
const fcrMaturesAt = new Date("2026-09-08T10:00:00.000Z");
const freshness: ReportingFreshness = {
  status: "FRESH",
  reason: null,
  projectionLagSeconds: 0,
  lastProjectedEventAt: asOf.toISOString(),
  lastProcessedAt: asOf.toISOString(),
};

type Row = {
  ticketId: number;
  dataQualityStatus: ReportingDataQualityStatus;
  exclusionReason: string | null;
  legacyImported: boolean;
  firstHumanPublicResponseAt: Date | null;
  firstResolvedAt: Date | null;
  firstClosedAt: Date | null;
  fcrMaturesAt: Date | null;
  fcrStatus: ReportingFcrStatus;
  reopenedWithinWindow: boolean | null;
  reopenWithinWindowEventCount: number;
  customerReopenWithinWindowCount: number;
  staffReopenWithinWindowCount: number;
  systemReopenWithinWindowCount: number;
  resolutionRejectionCount: number;
  transferCount: number;
  collaborationCount: number;
  hasCustomerReplyAfterFirstResponse: boolean;
  rating: number | null;
  ratedAt: Date | null;
};

function row(overrides: Partial<Row> = {}): Row {
  return {
    ticketId: 1,
    dataQualityStatus: "HEALTHY",
    exclusionReason: null,
    legacyImported: false,
    firstHumanPublicResponseAt: new Date("2026-09-01T08:30:00.000Z"),
    firstResolvedAt: new Date("2026-09-01T09:30:00.000Z"),
    firstClosedAt,
    fcrMaturesAt,
    fcrStatus: "ACHIEVED",
    reopenedWithinWindow: false,
    reopenWithinWindowEventCount: 0,
    customerReopenWithinWindowCount: 0,
    staffReopenWithinWindowCount: 0,
    systemReopenWithinWindowCount: 0,
    resolutionRejectionCount: 0,
    transferCount: 0,
    collaborationCount: 0,
    hasCustomerReplyAfterFirstResponse: false,
    rating: null,
    ratedAt: null,
    ...overrides,
  };
}

function report(fcrRows: Row[], closedRows: Row[], currentFreshness = freshness) {
  return buildQualityReport({
    definitionVersion: "KPI-V1",
    asOf,
    range: { from, to },
    scope: { type: "GLOBAL", accessMode: "MANAGEMENT", teamIds: null },
    freshness: currentFreshness,
    fcrRows,
    closedRows,
  });
}

describe("quality KPI report", () => {
  it("calculates FCR from the matured seven-day cohort", () => {
    const rows = [
      row({ ticketId: 1 }),
      row({
        ticketId: 2,
        reopenedWithinWindow: true,
        reopenWithinWindowEventCount: 1,
        customerReopenWithinWindowCount: 1,
      }),
      row({
        ticketId: 3,
        firstClosedAt: new Date("2026-09-14T10:00:00.000Z"),
        fcrMaturesAt: new Date("2026-09-21T10:00:00.000Z"),
        fcrStatus: "PENDING_WINDOW",
      }),
      row({ ticketId: 4, firstClosedAt: null, fcrMaturesAt: null }),
    ];

    expect(report(rows, []).firstContactResolution).toEqual({
      percentage: 50,
      reason: null,
      sampleCount: 2,
      achievedCount: 1,
      notAchievedCount: 1,
      pendingCloseCount: 1,
      pendingWindowCount: 1,
      excludedCount: 0,
    });
  });

  it("counts reopened tickets once while retaining event and source totals", () => {
    const rows = [
      row({
        ticketId: 1,
        reopenedWithinWindow: true,
        reopenWithinWindowEventCount: 2,
        customerReopenWithinWindowCount: 1,
        staffReopenWithinWindowCount: 1,
      }),
      row({ ticketId: 2 }),
    ];

    expect(report([], rows).reopenRate).toMatchObject({
      percentage: 50,
      sampleCount: 2,
      reopenedTicketCount: 1,
      reopenEventCount: 2,
      sources: {
        customer: { uniqueTicketCount: 1, eventCount: 1 },
        staff: { uniqueTicketCount: 1, eventCount: 1 },
        system: { uniqueTicketCount: 0, eventCount: 0 },
      },
    });
  });

  it("withholds CSAT below the minimum sample while exposing participation", () => {
    const rows = [
      row({ ticketId: 1, rating: 5, ratedAt: firstClosedAt }),
      row({ ticketId: 2, rating: 4, ratedAt: firstClosedAt }),
      row({ ticketId: 3, rating: 3, ratedAt: firstClosedAt }),
    ];
    const csat = report([], rows).customerSatisfaction;

    expect(csat).toMatchObject({
      score: null,
      reason: "INSUFFICIENT_SAMPLE",
      ratingCount: 3,
      eligibleClosedCount: 3,
      participationPercentage: 100,
      distribution: null,
      publicationThreshold: { met: false },
    });
  });

  it("publishes exact CSAT distribution after both thresholds are met", () => {
    const rows = Array.from({ length: 30 }, (_, index) =>
      row({
        ticketId: index + 1,
        rating: index < 15 ? 5 : 4,
        ratedAt: firstClosedAt,
      })
    );
    const csat = report([], rows).customerSatisfaction;

    expect(csat.score).toBe(4.5);
    expect(csat.participationPercentage).toBe(100);
    expect(csat.publicationThreshold.met).toBe(true);
    expect(csat.distribution).toEqual([
      { rating: 1, count: 0, percentage: 0 },
      { rating: 2, count: 0, percentage: 0 },
      { rating: 3, count: 0, percentage: 0 },
      { rating: 4, count: 15, percentage: 50 },
      { rating: 5, count: 15, percentage: 50 },
    ]);
  });

  it("withholds CSAT when thirty ratings are below twenty-percent participation", () => {
    const rows = Array.from({ length: 151 }, (_, index) =>
      row({
        ticketId: index + 1,
        rating: index < 30 ? 5 : null,
        ratedAt: index < 30 ? firstClosedAt : null,
      })
    );
    const csat = report([], rows).customerSatisfaction;

    expect(csat).toMatchObject({
      score: null,
      reason: "INSUFFICIENT_SAMPLE",
      ratingCount: 30,
      eligibleClosedCount: 151,
      participationPercentage: 19.87,
      distribution: null,
      publicationThreshold: { met: false },
    });
  });

  it("marks recent closed tickets provisional and accepts late ratings", () => {
    const recentClose = new Date("2026-09-14T10:00:00.000Z");
    const rows = [
      row({
        ticketId: 1,
        firstClosedAt: recentClose,
        fcrMaturesAt: new Date("2026-09-21T10:00:00.000Z"),
        rating: 5,
        ratedAt: new Date("2026-09-15T10:00:00.000Z"),
      }),
      row({
        ticketId: 2,
        rating: 4,
        ratedAt: new Date("2026-09-10T10:00:00.000Z"),
      }),
    ];
    const csat = report([], rows).customerSatisfaction;

    expect(csat).toMatchObject({
      ratingCount: 2,
      provisionalClosedCount: 1,
      matureClosedCount: 1,
    });
  });

  it("nulls all KPI values when the projection is unavailable", () => {
    const unavailable: ReportingFreshness = {
      ...freshness,
      status: "UNAVAILABLE",
      reason: "PROJECTION_FAILED",
    };
    const result = report([row()], [row()], unavailable);

    expect(result.firstContactResolution.reason).toBe("PROJECTION_UNAVAILABLE");
    expect(result.firstContactResolution.percentage).toBeNull();
    expect(result.reopenRate.percentage).toBeNull();
    expect(result.customerSatisfaction.score).toBeNull();
    expect(result.customerSatisfaction.participationPercentage).toBeNull();
  });

  it("fails closed when reopen counters violate their invariant", () => {
    const result = report([], [
      row({
        reopenedWithinWindow: true,
        reopenWithinWindowEventCount: 1,
        customerReopenWithinWindowCount: 0,
      }),
    ]);
    expect(result.reopenRate).toMatchObject({
      percentage: null,
      reason: "CRITICAL_DATA_QUALITY",
      excludedCount: 1,
    });
  });
});
