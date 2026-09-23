import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

type KnowledgeEventType =
  | "knowledge.article_published.v1"
  | "knowledge.article_archived.v1"
  | "support.journey_started.v1"
  | "support.resolution_confirmed.v1"
  | "support.converted_to_ticket.v1"
  | "support.outcome_finalized.v1";

export async function appendKnowledgeEvent(
  transaction: Prisma.TransactionClient,
  input: {
    aggregateType: "KNOWLEDGE_ARTICLE" | "SUPPORT_JOURNEY";
    aggregateId: string;
    eventType: KnowledgeEventType;
    occurredAt: Date;
    payload: Prisma.InputJsonObject;
  }
): Promise<void> {
  const eventId = randomUUID();
  await transaction.outboxEvent.create({
    data: {
      eventId,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      schemaVersion: 1,
      occurredAt: input.occurredAt,
      availableAt: input.occurredAt,
      payload: {
        eventId,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        schemaVersion: 1,
        occurredAt: input.occurredAt.toISOString(),
        payload: input.payload,
      },
    },
  });
}
