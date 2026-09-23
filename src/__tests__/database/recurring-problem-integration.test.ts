import { prisma } from "@/lib/prisma";
import { getRecurringProblemsReport } from "@/modules/reporting/application/recurring-problem-service";
import { reportingLocalDate, reportingMidnightInstant, shiftCalendarDate } from "@/modules/reporting/domain/reporting-local-date";

const runIntegration = process.env.RUN_RECURRING_PROBLEM_INTEGRATION === "1" ? it : it.skip;

describe("recurring problem database integration", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  runIntegration("reads the governed taxonomy and an authorized scoped report", async () => {
    const [assignment, rootCauseCount] = await Promise.all([
      prisma.userRoleAssignment.findFirst({
        where: {
          scopeType: "GLOBAL",
          scopeKey: "*",
          status: "ACTIVE",
          role: { permissions: { some: { permission: { key: "reporting.kpi.read.global" } } } },
        },
        select: { userId: true },
      }),
      prisma.reportingRootCauseDimension.count({ where: { status: "ACTIVE" } }),
    ]);
    if (!assignment) throw new Error("Local database has no global reporting reader");
    expect(rootCauseCount).toBeGreaterThanOrEqual(7);

    const now = new Date();
    const to = reportingMidnightInstant(reportingLocalDate(now));
    const report = await getRecurringProblemsReport({
      actorUserId: assignment.userId,
      query: {
        from: reportingMidnightInstant(shiftCalendarDate(reportingLocalDate(to), -45)),
        to,
        limit: 20,
      },
      now,
    });
    expect(report).toMatchObject({
      definitionVersion: "KPI-V1",
      timeZone: "Asia/Tehran",
      scope: { type: "GLOBAL", accessMode: "MANAGEMENT" },
      recurringWindow: { days: 7, baselineDays: 28 },
      thresholds: { minimumTickets: 5, minimumDistinctParties: 3, growthMultiplier: 2 },
    });
    expect(Array.isArray(report.ranking)).toBe(true);
    expect(Array.isArray(report.groups)).toBe(true);
  });
});
