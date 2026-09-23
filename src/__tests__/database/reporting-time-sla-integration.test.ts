import { prisma } from "@/lib/prisma";
import { getTimeSlaReport } from "@/modules/reporting/application/time-sla-report-service";

const runIntegration =
  process.env.RUN_REPORTING_TIME_SLA_INTEGRATION === "1" ? it : it.skip;

describe("reporting time and SLA database integration", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  runIntegration("reads an authorized, versioned and freshness-aware aggregate", async () => {
    const assignment = await prisma.userRoleAssignment.findFirst({
      where: {
        scopeType: "GLOBAL",
        scopeKey: "*",
        status: "ACTIVE",
        role: {
          permissions: {
            some: { permission: { key: "reporting.kpi.read.global" } },
          },
        },
      },
      select: { userId: true },
    });
    if (!assignment) {
      throw new Error("Local database has no explicit global reporting reader");
    }

    const now = new Date();
    const report = await getTimeSlaReport({
      actorUserId: assignment.userId,
      range: {
        from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000),
        to: new Date(now.getTime() + 1_000),
      },
      now,
    });

    expect(report).toMatchObject({
      definitionVersion: "KPI-V1",
      timeZone: "Asia/Tehran",
      range: { boundary: "HALF_OPEN" },
      scope: { type: "GLOBAL", accessMode: "MANAGEMENT" },
      freshness: {
        status: expect.stringMatching(/^(FRESH|STALE|UNAVAILABLE)$/),
      },
      dataQuality: {
        eligibleCount: expect.any(Number),
        excludedCount: expect.any(Number),
      },
    });
  });
});
