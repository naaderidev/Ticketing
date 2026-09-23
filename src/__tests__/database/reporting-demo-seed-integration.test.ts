import { prisma } from "@/lib/prisma";
import { getAutomatedResolutionReport } from "@/modules/reporting/application/automated-resolution-report-service";
import { getQualityReport } from "@/modules/reporting/application/quality-report-service";
import { rebuildReportingProjection } from "@/modules/reporting/application/reporting-projection-service";
import { getRecurringProblemsReport } from "@/modules/reporting/application/recurring-problem-service";
import { getTicketPerTransactionReport } from "@/modules/reporting/application/ticket-per-transaction-report-service";
import { getTimeSlaReport } from "@/modules/reporting/application/time-sla-report-service";

const runIntegration =
  process.env.RUN_REPORTING_DEMO_SEED_INTEGRATION === "1" ? describe : describe.skip;

function localDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function tehranMidnight(value: string): Date {
  return new Date(`${value}T00:00:00+03:30`);
}

runIntegration("reporting demo seed", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("publishes all nine management dashboard KPIs", async () => {
    const rebuild = await rebuildReportingProjection();
    expect(rebuild.status).toBe("HEALTHY");
    expect(rebuild.processed).toBeGreaterThan(0);
    expect(rebuild.ignored).toBe(0);

    const manager = await prisma.user.findFirst({
      where: {
        role: "ADMIN",
        roleAssignments: {
          some: {
            status: "ACTIVE",
            role: { key: "SUPPORT_MANAGER" },
          },
        },
      },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    expect(manager).not.toBeNull();

    const today = localDate();
    const range = {
      from: tehranMidnight(shiftDate(today, -30)),
      to: tehranMidnight(today),
    };
    const [timeSla, quality, automated, recurring, transaction] =
      await Promise.all([
        getTimeSlaReport({ actorUserId: manager!.id, range }),
        getQualityReport({ actorUserId: manager!.id, range }),
        getAutomatedResolutionReport({ actorUserId: manager!.id, range }),
        getRecurringProblemsReport({
          actorUserId: manager!.id,
          query: { ...range, limit: 50 },
        }),
        getTicketPerTransactionReport({
          actorUserId: manager!.id,
          query: {
            ...range,
            providerCode: "DEMO_PRODUCT_SEED",
            transactionType: "PAYMENT",
            organizationId: undefined,
          },
        }),
      ]);

    expect(timeSla.firstResponseTime.value).not.toBeNull();
    expect(timeSla.resolutionTime.value).not.toBeNull();
    expect(timeSla.slaCompliance.combined.percentage).not.toBeNull();
    expect(quality.firstContactResolution.percentage).not.toBeNull();
    expect(quality.reopenRate.percentage).not.toBeNull();
    expect(quality.customerSatisfaction.score).not.toBeNull();
    expect(automated.automatedResolution.percentage).not.toBeNull();
    expect(recurring.ranking.length).toBeGreaterThan(0);
    expect(
      recurring.groups.some((group) => group.status === "RECURRING")
    ).toBe(true);
    expect(transaction.ticketPerTransaction.value).not.toBeNull();
  });
});
