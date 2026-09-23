import { prisma } from "@/lib/prisma";
import {
  processReportingProjection,
  rebuildReportingProjection,
  REPORTING_PROJECTION_CONSUMER,
} from "@/modules/reporting/application/reporting-projection-service";

const integrationEnabled = process.env.RUN_REPORTING_PROJECTION_INTEGRATION === "1";
const describeIntegration = integrationEnabled ? describe : describe.skip;

function requireLocalDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const parsed = new URL(databaseUrl);
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(parsed.hostname)) {
    throw new Error("Reporting projection integration test only runs on a local database");
  }
}

describeIntegration("reporting projection database integration", () => {
  beforeAll(() => {
    requireLocalDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rebuilds every outbox event once and is idle on the next run", async () => {
    const rebuilt = await rebuildReportingProjection();
    const [outboxCount, processedCount, facts, checkpoint] = await Promise.all([
      prisma.outboxEvent.count(),
      prisma.reportingProcessedEvent.count(),
      prisma.ticketReportingFact.findMany({
        select: { dataQualityStatus: true, exclusionReason: true },
      }),
      prisma.reportingProjectionCheckpoint.findUnique({
        where: { consumerName: REPORTING_PROJECTION_CONSUMER },
      }),
    ]);

    expect(rebuilt.processed).toBe(outboxCount);
    expect(processedCount).toBe(outboxCount);
    expect(checkpoint).toMatchObject({
      status: "HEALTHY",
      failureCount: 0,
      leaseToken: null,
    });
    expect(checkpoint?.lastOutboxEventId?.toString()).toBe(
      rebuilt.lastOutboxEventId
    );
    expect(
      facts.some(
        (fact) =>
          fact.exclusionReason === "HISTORICAL_INCOMPLETE" &&
          fact.dataQualityStatus !== "EXCLUDED"
      )
    ).toBe(false);

    const secondRun = await processReportingProjection();
    expect(secondRun).toMatchObject({
      acquired: true,
      processed: 0,
      applied: 0,
      ignored: 0,
      replayed: 0,
      hasMore: false,
      status: "HEALTHY",
    });
    expect(await prisma.reportingProcessedEvent.count()).toBe(outboxCount);
  });
});
