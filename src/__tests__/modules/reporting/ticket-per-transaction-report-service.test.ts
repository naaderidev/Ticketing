import { buildTicketPerTransactionReport, requirePublishableOrganizationBreakdown } from "@/modules/reporting/application/ticket-per-transaction-report-service";
import type { ReportingFreshness } from "@/modules/reporting/domain/reporting-freshness";

const from = new Date("2026-09-14T20:30:00.000Z");
const to = new Date("2026-09-15T20:30:00.000Z");
const freshness: ReportingFreshness = {
  status: "FRESH",
  reason: null,
  projectionLagSeconds: 0,
  lastProjectedEventAt: from.toISOString(),
  lastProcessedAt: from.toISOString(),
};

function report(overrides: Partial<Parameters<typeof buildTicketPerTransactionReport>[0]> = {}) {
  return buildTicketPerTransactionReport({
    definitionVersion: "KPI-V1",
    asOf: new Date("2026-09-15T12:00:00.000Z"),
    query: {
      from,
      to,
      providerCode: "PAYMENT_CORE",
      transactionType: "PAYMENT",
      organizationId: undefined,
    },
    scope: { type: "GLOBAL", accessMode: "MANAGEMENT", teamIds: null },
    freshness,
    ticketRows: Array.from({ length: 20 }, () => ({
      dataQualityStatus: "HEALTHY" as const,
      legacyImported: false,
      hasVerifiedCompatibleReference: true,
    })),
    volumeRows: [
      {
        localDate: new Date("2026-09-15T00:00:00.000Z"),
        successfulTransactionCount: BigInt(10_000),
        status: "VERIFIED",
        sourceVersion: "daily-v1",
      },
    ],
    ...overrides,
  });
}

describe("ticket-per-transaction KPI", () => {
  it("suppresses organization breakdowns below the five-ticket privacy threshold", () => {
    expect(() => requirePublishableOrganizationBreakdown(4, 4)).toThrow(
      "نمونه کافی برای انتشار گزارش سازمانی وجود ندارد"
    );
    expect(() => requirePublishableOrganizationBreakdown(4, 5)).not.toThrow();
    expect(() => requirePublishableOrganizationBreakdown(undefined, 0)).not.toThrow();
  });
  it("calculates the approved example as two tickets per thousand", () => {
    expect(report().ticketPerTransaction).toEqual({
      value: 2,
      unit: "TICKETS_PER_1000_SUCCESSFUL_TRANSACTIONS",
      reason: null,
      verifiedUniqueTicketCount: 20,
      successfulTransactionCount: "10000",
    });
  });

  it.each([
    [[], "DENOMINATOR_UNAVAILABLE"],
    [[{
      localDate: new Date("2026-09-15T00:00:00.000Z"),
      successfulTransactionCount: BigInt(0),
      status: "VERIFIED" as const,
      sourceVersion: "daily-v1",
    }], "DENOMINATOR_UNAVAILABLE"],
    [[{
      localDate: new Date("2026-09-15T00:00:00.000Z"),
      successfulTransactionCount: BigInt(10_000),
      status: "PROVISIONAL" as const,
      sourceVersion: "daily-v1",
    }], "DENOMINATOR_UNAVAILABLE"],
  ])("withholds the metric for an invalid denominator", (volumeRows, reason) => {
    const result = report({ volumeRows });
    expect(result.ticketPerTransaction.value).toBeNull();
    expect(result.ticketPerTransaction.reason).toBe(reason);
  });

  it("counts only healthy non-legacy tickets with a verified compatible reference", () => {
    const result = report({
      ticketRows: [
        { dataQualityStatus: "HEALTHY", legacyImported: false, hasVerifiedCompatibleReference: true },
        { dataQualityStatus: "HEALTHY", legacyImported: false, hasVerifiedCompatibleReference: false },
        { dataQualityStatus: "HEALTHY", legacyImported: true, hasVerifiedCompatibleReference: true },
      ],
    });
    expect(result.ticketPerTransaction.verifiedUniqueTicketCount).toBe(1);
    expect(result.dataQuality.excludedTicketCount).toBe(2);
  });

  it("fails closed when projection or ticket quality is critical", () => {
    expect(report({ freshness: { ...freshness, status: "UNAVAILABLE", reason: "PROJECTION_FAILED" } }).ticketPerTransaction.reason)
      .toBe("PROJECTION_UNAVAILABLE");
    expect(report({ ticketRows: [{ dataQualityStatus: "INCOMPLETE", legacyImported: false, hasVerifiedCompatibleReference: true }] }).ticketPerTransaction.reason)
      .toBe("CRITICAL_DATA_QUALITY");
  });
});
