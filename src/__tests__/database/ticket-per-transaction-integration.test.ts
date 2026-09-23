import { prisma } from "@/lib/prisma";
import { ingestTransactionVolumes } from "@/modules/reporting/application/transaction-volume-ingestion-service";
import { getTicketPerTransactionReport } from "@/modules/reporting/application/ticket-per-transaction-report-service";
import { transactionVolumeBatchSchema } from "@/modules/reporting/contracts/reporting-kpi-schemas";

const runIntegration =
  process.env.RUN_TICKET_PER_TRANSACTION_INTEGRATION === "1" ? it : it.skip;
const providerCode = "KPI7_INTEGRATION";

describe("ticket-per-transaction database integration", () => {
  afterEach(async () => {
    await prisma.transactionVolumeDaily.deleteMany({ where: { providerCode } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  runIntegration("ingests, replays, verifies and reports one authoritative bucket", async () => {
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

    const provisional = transactionVolumeBatchSchema.parse({
      providerCode,
      sourceVersion: "integration-v1",
      rows: [{
        transactionType: "PAYMENT",
        localDate: "2026-09-15",
        bucketStartedAt: "2026-09-14T20:30:00.000Z",
        bucketEndedAt: "2026-09-15T20:30:00.000Z",
        scopeType: "GLOBAL",
        successfulTransactionCount: "10000",
        status: "PROVISIONAL",
      }],
    });
    expect(await ingestTransactionVolumes(provisional)).toMatchObject({ inserted: 1 });
    expect(await ingestTransactionVolumes(provisional)).toMatchObject({ replayed: 1 });
    expect(await ingestTransactionVolumes({
      ...provisional,
      rows: provisional.rows.map((row) => ({ ...row, status: "VERIFIED" as const })),
    })).toMatchObject({ statusUpdated: 1 });

    const report = await getTicketPerTransactionReport({
      actorUserId: assignment.userId,
      query: {
        from: new Date("2026-09-14T20:30:00.000Z"),
        to: new Date("2026-09-15T20:30:00.000Z"),
        providerCode,
        transactionType: "PAYMENT",
        organizationId: undefined,
      },
      now: new Date("2026-09-15T20:30:01.000Z"),
    });
    expect(report.dataQuality).toMatchObject({ expectedBucketCount: 1, verifiedBucketCount: 1 });
    expect(report.ticketPerTransaction.successfulTransactionCount).toBe("10000");
  });

  runIntegration("enforces organization referential integrity in database triggers", async () => {
    await expect(
      prisma.transactionVolumeDaily.create({
        data: {
          providerCode,
          transactionType: "PAYMENT",
          localDate: new Date("2026-09-15T00:00:00.000Z"),
          bucketStartedAt: new Date("2026-09-14T20:30:00.000Z"),
          bucketEndedAt: new Date("2026-09-15T20:30:00.000Z"),
          scopeType: "ORGANIZATION",
          scopeKey: "2147483647",
          organizationId: 2_147_483_647,
          successfulTransactionCount: BigInt(1),
          sourceVersion: "integration-v1",
          sourceChecksum: "a".repeat(64),
          status: "VERIFIED",
        },
      })
    ).rejects.toBeDefined();

    const party = await prisma.party.create({
      data: {
        type: "ORGANIZATION",
        displayName: "KPI-7 integration organization",
        organization: {
          create: { legalName: "KPI-7 integration organization" },
        },
      },
      select: { id: true, organization: { select: { id: true } } },
    });
    const organizationId = party.organization?.id;
    if (!organizationId) throw new Error("Integration organization was not created");
    try {
      await prisma.transactionVolumeDaily.create({
        data: {
          providerCode,
          transactionType: "PAYMENT",
          localDate: new Date("2026-09-15T00:00:00.000Z"),
          bucketStartedAt: new Date("2026-09-14T20:30:00.000Z"),
          bucketEndedAt: new Date("2026-09-15T20:30:00.000Z"),
          scopeType: "ORGANIZATION",
          scopeKey: organizationId.toString(),
          organizationId,
          successfulTransactionCount: BigInt(1),
          sourceVersion: "integration-v1",
          sourceChecksum: "b".repeat(64),
          status: "VERIFIED",
        },
      });
      await expect(
        prisma.organization.delete({ where: { id: organizationId } })
      ).rejects.toBeDefined();
    } finally {
      await prisma.transactionVolumeDaily.deleteMany({
        where: { organizationId },
      });
      await prisma.organization.delete({ where: { id: organizationId } });
      await prisma.party.delete({ where: { id: party.id } });
    }
  });
});
