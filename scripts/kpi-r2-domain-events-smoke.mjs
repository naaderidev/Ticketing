import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function integer(value) {
  return Number(value ?? 0);
}

async function main() {
  const [eventIntegrity] = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*) AS eventCount,
      SUM(CASE WHEN outbox.id IS NULL THEN 1 ELSE 0 END) AS missingOutboxCount,
      SUM(CASE WHEN outbox.id IS NOT NULL AND outbox.eventId <> event.eventId THEN 1 ELSE 0 END) AS eventIdMismatchCount,
      SUM(CASE WHEN event.aggregateVersion IS NULL THEN 1 ELSE 0 END) AS historicalIncompleteCount
    FROM TicketEvent event
    LEFT JOIN OutboxEvent outbox ON outbox.ticketEventId = event.id
  `);
  const [envelopeIntegrity] = await prisma.$queryRawUnsafe(`
    SELECT
      SUM(CASE WHEN JSON_CONTAINS_PATH(
        payload,
        'all',
        '$.eventId',
        '$.eventType',
        '$.aggregateType',
        '$.aggregateId',
        '$.aggregateVersion',
        '$.schemaVersion',
        '$.occurredAt',
        '$.actor',
        '$.sourceType',
        '$.scope',
        '$.payload.dimensions',
        '$.payload.attributes'
      ) = 0 THEN 1 ELSE 0 END) AS invalidEnvelopeCount,
      SUM(CASE WHEN JSON_CONTAINS_PATH(
        payload,
        'one',
        '$.metadata',
        '$.payload.metadata',
        '$.payload.attributes.message',
        '$.payload.attributes.resolutionSummary',
        '$.payload.attributes.rootCause',
        '$.payload.attributes.mobile',
        '$.payload.attributes.nationalCode',
        '$.payload.attributes.token'
      ) = 1 THEN 1 ELSE 0 END) AS unsafePayloadCount
    FROM OutboxEvent
    WHERE ticketEventId IS NOT NULL
  `);
  const [deliveryIntegrity] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS duplicateDeliveryGroupCount
    FROM (
      SELECT outboxEventId, consumer
      FROM OutboxDelivery
      GROUP BY outboxEventId, consumer
      HAVING COUNT(*) > 1
    ) duplicate_delivery
  `);

  const checks = {
    eventCount: integer(eventIntegrity.eventCount),
    missingOutboxCount: integer(eventIntegrity.missingOutboxCount),
    eventIdMismatchCount: integer(eventIntegrity.eventIdMismatchCount),
    historicalIncompleteCount: integer(eventIntegrity.historicalIncompleteCount),
    invalidEnvelopeCount: integer(envelopeIntegrity.invalidEnvelopeCount),
    unsafePayloadCount: integer(envelopeIntegrity.unsafePayloadCount),
    duplicateDeliveryGroupCount: integer(
      deliveryIntegrity.duplicateDeliveryGroupCount
    ),
  };

  if (checks.eventCount === 0) {
    throw new Error("At least one seeded TicketEvent is required");
  }
  for (const key of [
    "missingOutboxCount",
    "eventIdMismatchCount",
    "invalidEnvelopeCount",
    "unsafePayloadCount",
    "duplicateDeliveryGroupCount",
  ]) {
    if (checks[key] !== 0) throw new Error(`${key} must be zero`);
  }

  console.log(JSON.stringify({ ok: true, ...checks }));
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        event: "kpi_r2_domain_events_smoke_failed",
        errorType: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : "Unknown error",
      })
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
