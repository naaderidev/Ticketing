import { buildAutomatedResolutionReport, type SupportJourneyReportRow } from "@/modules/reporting/application/automated-resolution-report-service";

const asOf = new Date("2026-09-15T12:00:00.000Z");
const range = {
  from: new Date("2026-09-01T00:00:00.000Z"),
  to: new Date("2026-10-01T00:00:00.000Z"),
};
const freshness = {
  status: "FRESH" as const,
  reason: null,
  projectionLagSeconds: 0,
  lastProjectedEventAt: asOf.toISOString(),
  lastProcessedAt: asOf.toISOString(),
};

function journey(overrides: Partial<SupportJourneyReportRow> = {}): SupportJourneyReportRow {
  return {
    status: "CONTENT_SHOWN",
    contentIsPublicApprovedActive: true,
    knowledgeArticleVersionId: BigInt(1),
    contentShownAt: new Date("2026-09-10T08:00:00.000Z"),
    confirmedResolvedAt: null,
    conversionDeadlineAt: null,
    humanInterventionAt: null,
    convertedTicketId: null,
    outcomeFinalizedAt: null,
    exclusionReason: null,
    serviceId: 1,
    requestTypeId: 2,
    supportTeamId: 3,
    ...overrides,
  };
}

function report(rows: SupportJourneyReportRow[]) {
  return buildAutomatedResolutionReport({
    definitionVersion: "KPI-V1",
    asOf,
    range,
    scope: { type: "GLOBAL", accessMode: "MANAGEMENT", teamIds: null },
    freshness,
    rows,
  });
}

describe("automated resolution KPI", () => {
  it("calculates the approved 30 confirmed resolutions from 100 eligible journeys", () => {
    const confirmed = Array.from({ length: 30 }, () => journey({
      status: "CONFIRMED_RESOLVED",
      confirmedResolvedAt: new Date("2026-09-10T08:10:00.000Z"),
      conversionDeadlineAt: new Date("2026-09-11T08:10:00.000Z"),
      outcomeFinalizedAt: new Date("2026-09-11T08:11:00.000Z"),
    }));
    const converted = Array.from({ length: 20 }, (_, index) => journey({
      status: "CONVERTED_TO_TICKET",
      convertedTicketId: index + 1,
      outcomeFinalizedAt: new Date("2026-09-10T09:00:00.000Z"),
    }));
    const withHuman = Array.from({ length: 10 }, () => journey({
      humanInterventionAt: new Date("2026-09-10T08:05:00.000Z"),
    }));
    const unknown = Array.from({ length: 40 }, () => journey());

    expect(report([...confirmed, ...converted, ...withHuman, ...unknown]).automatedResolution).toEqual({
      percentage: 30,
      reason: null,
      sampleCount: 100,
      confirmedAutomatedCount: 30,
      convertedToTicketCount: 20,
      humanInterventionCount: 10,
      unknownOutcomeCount: 40,
      excludedCount: 0,
    });
  });

  it("withholds the KPI when a finalized outcome is internally inconsistent", () => {
    const result = report([journey({
      status: "CONFIRMED_RESOLVED",
      outcomeFinalizedAt: new Date("2026-09-11T08:11:00.000Z"),
    })]);
    expect(result.automatedResolution).toMatchObject({
      percentage: null,
      reason: "CRITICAL_DATA_QUALITY",
    });
    expect(result.dataQuality.missingEventCount).toBe(1);
  });

  it("excludes content that was not public, approved and active", () => {
    const result = report([journey({ contentIsPublicApprovedActive: false })]);
    expect(result.automatedResolution).toMatchObject({
      percentage: null,
      reason: "ZERO_DENOMINATOR",
      sampleCount: 0,
      excludedCount: 1,
    });
  });
});
