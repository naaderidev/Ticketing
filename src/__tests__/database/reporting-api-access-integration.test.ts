import { prisma } from "@/lib/prisma";
import { getAutomatedResolutionReport } from "@/modules/reporting/application/automated-resolution-report-service";
import { getReportingAccessCapabilities } from "@/modules/reporting/application/reporting-authorization";

const runIntegration = process.env.RUN_REPORTING_API_ACCESS_INTEGRATION === "1" ? it : it.skip;

describe("reporting API and access database integration", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  runIntegration("reads KPI-07 and effective capabilities for an explicit global reader", async () => {
    const assignment = await prisma.userRoleAssignment.findFirst({
      where: {
        scopeType: "GLOBAL",
        scopeKey: "*",
        status: "ACTIVE",
        role: { permissions: { some: { permission: { key: "reporting.kpi.read.global" } } } },
      },
      select: { userId: true },
    });
    if (!assignment) throw new Error("Local database has no global reporting reader");

    const now = new Date();
    const [capabilities, report] = await Promise.all([
      getReportingAccessCapabilities(assignment.userId, now),
      getAutomatedResolutionReport({
        actorUserId: assignment.userId,
        range: {
          from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000),
          to: new Date(now.getTime() + 1_000),
        },
        now,
      }),
    ]);

    expect(capabilities).toMatchObject({
      scope: { type: "GLOBAL", accessMode: "MANAGEMENT" },
      canDrillDown: expect.any(Boolean),
      canExport: expect.any(Boolean),
      reports: { automatedResolution: true, recurringProblems: true },
    });
    expect(report).toMatchObject({
      definitionVersion: "KPI-V1",
      timeZone: "Asia/Tehran",
      scope: { type: "GLOBAL", accessMode: "MANAGEMENT" },
      automatedResolution: {
        sampleCount: expect.any(Number),
        confirmedAutomatedCount: expect.any(Number),
        unknownOutcomeCount: expect.any(Number),
      },
    });
  });
});
