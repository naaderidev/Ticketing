import { prisma } from "@/lib/prisma";
import {
  backfillReportingProjection,
  rebuildReportingProjection,
  REPORTING_PROJECTION_CONSUMER,
} from "@/modules/reporting/application/reporting-projection-service";
import { reconcileReportingProjection } from "@/modules/reporting/application/reporting-reconciliation-service";

const integrationEnabled =
  process.env.RUN_REPORTING_BACKFILL_RELEASE_INTEGRATION === "1";
const describeIntegration = integrationEnabled ? describe : describe.skip;

function requireLocalDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const parsed = new URL(databaseUrl);
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(parsed.hostname)) {
    throw new Error(
      "Reporting backfill integration test only runs on a local or disposable database"
    );
  }
}

describeIntegration("reporting backfill and release reconciliation", () => {
  beforeAll(() => {
    requireLocalDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects an oversized rebuild before touching derived reporting data", async () => {
    const outboxCount = await prisma.outboxEvent.count({
      where: { aggregateType: "TICKET" },
    });
    if (outboxCount === 0) return;

    const before = await Promise.all([
      prisma.reportingProcessedEvent.count(),
      prisma.ticketReportingFact.count(),
      prisma.reportingProjectionCheckpoint.findUnique({
        where: { consumerName: REPORTING_PROJECTION_CONSUMER },
        select: { lastOutboxEventId: true, status: true },
      }),
    ]);
    const previousLimit = process.env.REPORTING_REBUILD_MAX_EVENTS;
    process.env.REPORTING_REBUILD_MAX_EVENTS = String(outboxCount - 1);
    try {
      await expect(rebuildReportingProjection()).rejects.toMatchObject({
        code: "REBUILD_EVENT_LIMIT_EXCEEDED",
      });
    } finally {
      if (previousLimit === undefined) {
        delete process.env.REPORTING_REBUILD_MAX_EVENTS;
      } else {
        process.env.REPORTING_REBUILD_MAX_EVENTS = previousLimit;
      }
    }

    const after = await Promise.all([
      prisma.reportingProcessedEvent.count(),
      prisma.ticketReportingFact.count(),
      prisma.reportingProjectionCheckpoint.findUnique({
        where: { consumerName: REPORTING_PROJECTION_CONSUMER },
        select: { lastOutboxEventId: true, status: true },
      }),
    ]);
    expect(after).toEqual(before);
  }, 30_000);

  it("resumes an interrupted backfill from its persisted checkpoint", async () => {
    const resumed = await backfillReportingProjection();
    const report = await reconcileReportingProjection();

    expect(["BACKFILL", "NOOP", "RESUME"]).toContain(resumed.mode);
    expect(report.ready).toBe(true);
    expect(report.blockers).toEqual([]);
  }, 180_000);

  it("rebuilds the read model, reconciles it, and makes the next run a no-op", async () => {
    const rebuilt = await rebuildReportingProjection();
    const report = await reconcileReportingProjection();

    expect(rebuilt.mode).toBe("REBUILD");
    expect(rebuilt.processed).toBe(rebuilt.sourceEvents);
    expect(report.ready).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.counts.sourceEvents).toBe(report.counts.processedEvents);
    expect(report.checkpoint).toMatchObject({
      status: "HEALTHY",
      failureCount: 0,
      leaseActive: false,
      lastOutboxEventId: report.sourceHighWatermark,
    });
    if (process.env.REPORTING_RECONCILIATION_OUTPUT === "1") {
      console.log(
        JSON.stringify({
          event: "reporting_release_reconciliation",
          ready: report.ready,
          definitionVersion: report.definitionVersion,
          sourceHighWatermark: report.sourceHighWatermark,
          counts: report.counts,
          checkpoint: report.checkpoint,
          blockers: report.blockers,
          warnings: report.warnings,
        })
      );
    }

    const nextRun = await backfillReportingProjection();
    expect(nextRun).toMatchObject({
      mode: "NOOP",
      processed: 0,
      hasMore: false,
      status: "HEALTHY",
    });
  }, 180_000);
});
