import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

class RollbackSmokeTest extends Error {}

async function expectDatabaseRejection(operation, invariantName) {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(`Database accepted invalid ${invariantName}`);
}

async function verifyReportingConstraints(transaction, ticket) {
  const fact = await transaction.ticketReportingFact.create({
    data: {
      ticketId: ticket.id,
      definitionVersion: "KPI-V1",
      ticketCreatedAt: ticket.createdAt,
    },
  });
  await expectDatabaseRejection(
    () =>
      transaction.ticketReportingFact.update({
        where: { id: fact.id },
        data: { rating: 6 },
      }),
    "ticket rating"
  );

  const eventId = randomUUID();
  await transaction.reportingProcessedEvent.create({
    data: {
      eventId,
      aggregateType: "TICKET",
      aggregateId: ticket.ticketId,
      eventType: "ticket.created.v1",
      occurredAt: ticket.createdAt,
      definitionVersion: "KPI-V1",
      outcome: "APPLIED",
    },
  });
  await expectDatabaseRejection(
    () =>
      transaction.reportingProcessedEvent.create({
        data: {
          eventId,
          aggregateType: "TICKET",
          aggregateId: ticket.ticketId,
          eventType: "ticket.created.v1",
          occurredAt: ticket.createdAt,
          definitionVersion: "KPI-V1",
          outcome: "IGNORED",
        },
      }),
    "duplicate reporting event"
  );

  const startedAt = new Date("2026-09-14T00:00:00.000Z");
  const endedAt = new Date("2026-09-15T00:00:00.000Z");
  const sourceChecksum = createHash("sha256")
    .update(randomUUID())
    .digest("hex");
  const volume = await transaction.transactionVolumeDaily.create({
    data: {
      providerCode: `SMOKE_${randomUUID().slice(0, 8)}`,
      transactionType: "PAYMENT",
      localDate: startedAt,
      bucketStartedAt: startedAt,
      bucketEndedAt: endedAt,
      scopeType: "GLOBAL",
      scopeKey: "*",
      successfulTransactionCount: 10n,
      totalTransactionCount: 12n,
      sourceVersion: "smoke-v1",
      sourceChecksum,
      status: "VERIFIED",
    },
  });
  await expectDatabaseRejection(
    () =>
      transaction.transactionVolumeDaily.update({
        where: { id: volume.id },
        data: { successfulTransactionCount: -1n },
      }),
    "transaction volume"
  );

  const journey = await transaction.supportJourney.create({
    data: {
      id: randomUUID(),
      definitionVersion: "KPI-V1",
      partyKeyHash: createHash("sha256").update(randomUUID()).digest("hex"),
      channel: "WEB",
      startedAt,
    },
  });
  await expectDatabaseRejection(
    () =>
      transaction.supportJourney.update({
        where: { id: journey.id },
        data: { confirmedResolvedAt: new Date("2026-09-13T23:59:59.000Z") },
      }),
    "journey resolution order"
  );

  const signal = await transaction.recurringProblemSignal.create({
    data: {
      signalKey: createHash("sha256").update(randomUUID()).digest("hex"),
      definitionVersion: "KPI-V1",
      windowStartedAt: startedAt,
      windowEndedAt: endedAt,
      ticketCount: 5,
      distinctPartyCount: 3,
      eligibleCauseTicketCount: 5,
      status: "NEW_SIGNAL",
      generatedAt: endedAt,
    },
  });
  await expectDatabaseRejection(
    () =>
      transaction.recurringProblemSignal.update({
        where: { id: signal.id },
        data: { ticketCount: -1 },
      }),
    "recurring problem count"
  );
}

async function main() {
  const activeContract = await prisma.kpiDefinitionVersion.findFirst({
    where: {
      version: "KPI-V1",
      status: "ACTIVE",
      activeKey: "SUPPORT_KPI",
    },
  });
  if (!activeContract) throw new Error("Active KPI-V1 contract is missing");

  const ticket = await prisma.ticket.findFirst({
    orderBy: { id: "asc" },
    select: { id: true, ticketId: true, createdAt: true },
  });
  if (!ticket) throw new Error("A seeded ticket is required for the smoke test");

  try {
    await prisma.$transaction(
      async (transaction) => {
        await verifyReportingConstraints(transaction, ticket);
        throw new RollbackSmokeTest("rollback reporting smoke data");
      },
      { maxWait: 10_000, timeout: 30_000 }
    );
  } catch (error) {
    if (!(error instanceof RollbackSmokeTest)) throw error;
  }

  const persistedFact = await prisma.ticketReportingFact.findUnique({
    where: { ticketId: ticket.id },
    select: { id: true },
  });
  if (persistedFact) throw new Error("Smoke test rollback did not remove its fact");

  console.log(
    JSON.stringify({
      ok: true,
      definitionVersion: activeContract.version,
      invalidWritesRejected: 5,
      smokeRowsPersisted: 0,
    })
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        event: "kpi_r1_data_model_smoke_failed",
        errorType: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : "Unknown error",
      })
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
