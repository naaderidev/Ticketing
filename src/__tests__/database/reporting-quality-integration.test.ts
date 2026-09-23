import { prisma } from "@/lib/prisma";
import { getQualityReport } from "@/modules/reporting/application/quality-report-service";

const runIntegration =
  process.env.RUN_REPORTING_QUALITY_INTEGRATION === "1" ? it : it.skip;

describe("reporting quality database integration", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  runIntegration("reads an authorized and freshness-aware quality aggregate", async () => {
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
    const report = await getQualityReport({
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
      firstContactResolution: {
        achievedCount: expect.any(Number),
        pendingWindowCount: expect.any(Number),
      },
      reopenRate: {
        reopenedTicketCount: expect.any(Number),
        sources: {
          customer: { eventCount: expect.any(Number) },
          staff: { eventCount: expect.any(Number) },
          system: { eventCount: expect.any(Number) },
        },
      },
      customerSatisfaction: {
        ratingCount: expect.any(Number),
        provisionalClosedCount: expect.any(Number),
      },
    });
  });
});
