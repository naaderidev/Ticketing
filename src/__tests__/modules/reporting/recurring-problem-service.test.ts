import { buildRecurringProblemsReport, type RecurringProblemFactRow } from "@/modules/reporting/application/recurring-problem-service";

const to = new Date("2026-09-14T20:30:00.000Z");
const from = new Date("2026-07-31T20:30:00.000Z");
const freshness = {
  status: "FRESH" as const,
  reason: null,
  projectionLagSeconds: 0,
  lastProjectedEventAt: to.toISOString(),
  lastProcessedAt: to.toISOString(),
};

function row(input: {
  ticketId: number;
  createdAt: string;
  party: number;
  cause?: boolean;
}): RecurringProblemFactRow {
  return {
    ticketId: input.ticketId,
    ticketCreatedAt: new Date(input.createdAt),
    serviceId: 1,
    serviceCode: "IDENTITY_ACCESS",
    serviceName: "حساب کاربری و اپلیکیشن",
    requestTypeId: 2,
    requestTypeCode: "APP_ERROR",
    requestTypeName: "خطای اپلیکیشن",
    normalizedRootCauseId: input.cause === false ? null : 3,
    normalizedRootCauseCode: input.cause === false ? null : "APP_FRONTEND_DEFECT",
    normalizedRootCauseName: input.cause === false ? null : "خطای رابط کاربری",
    incidentKey: null,
    partyKeyHash: String(input.party).padStart(64, "0"),
    dataQualityStatus: "HEALTHY",
    legacyImported: false,
  };
}

function build(rows: RecurringProblemFactRow[], definitionEffectiveFrom = new Date("2026-01-01T00:00:00.000Z")) {
  return buildRecurringProblemsReport({
    definitionVersion: "KPI-V1",
    definitionEffectiveFrom,
    asOf: to,
    query: { from, to, limit: 50 },
    scope: { type: "GLOBAL", accessMode: "MANAGEMENT", teamIds: null },
    freshness,
    drillDownAvailable: true,
    rows,
  });
}

describe("recurring problem detection", () => {
  it("meets the approved 12-ticket, 4-party and weekly-baseline acceptance example", () => {
    const baseline = Array.from({ length: 16 }, (_, index) => row({
      ticketId: index + 1,
      createdAt: `2026-08-${String(12 + index).padStart(2, "0")}T08:00:00.000Z`,
      party: index % 4,
    }));
    const current = Array.from({ length: 12 }, (_, index) => row({
      ticketId: 100 + index,
      createdAt: `2026-09-${String(9 + (index % 5)).padStart(2, "0")}T08:00:00.000Z`,
      party: index % 4,
    }));

    const report = build([...baseline, ...current]);

    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]).toMatchObject({
      ticketCount: 12,
      distinctPartyCount: 4,
      baselineWeeklyAverage: 4,
      growthPercent: 200,
      status: "RECURRING",
      drillDownAvailable: true,
    });
    expect(report.recurringRate).toMatchObject({
      percentage: 100,
      recurringTicketCount: 12,
      eligibleCauseTicketCount: 12,
    });
  });

  it("publishes NEW_SIGNAL without growth when 28 days of governed history do not exist", () => {
    const current = Array.from({ length: 5 }, (_, index) => row({
      ticketId: 200 + index,
      createdAt: `2026-09-${String(9 + index).padStart(2, "0")}T08:00:00.000Z`,
      party: index % 3,
    }));
    const report = build(current, new Date("2026-09-01T00:00:00.000Z"));
    expect(report.recurringWindow.baselineComplete).toBe(false);
    expect(report.groups[0]).toMatchObject({ status: "NEW_SIGNAL", growthPercent: null, baselineWeeklyAverage: null });
  });

  it("keeps ungoverned free-text causes out of recurring groups", () => {
    const current = Array.from({ length: 8 }, (_, index) => row({
      ticketId: 300 + index,
      createdAt: "2026-09-10T08:00:00.000Z",
      party: index % 4,
      cause: false,
    }));
    const report = build(current);
    expect(report.ranking[0]).toMatchObject({ count: 8, sharePercentage: 100 });
    expect(report.groups).toHaveLength(0);
    expect(report.recurringRate).toMatchObject({ percentage: null, reason: "ZERO_DENOMINATOR" });
  });
});
