import { createHash, randomUUID } from "node:crypto";
import { Prisma, type SupportJourneyStatus } from "@prisma/client";
import type { CurrentUser } from "@/lib/current-user";
import { runSerializableTransaction } from "@/lib/database-transaction";
import { getPersistenceErrorCode } from "@/lib/domain-error";
import { prisma } from "@/lib/prisma";
import { hashSecurityValue } from "@/lib/request-security";
import { appendKnowledgeEvent } from "@/modules/knowledge/application/knowledge-outbox";
import { KnowledgeError } from "@/modules/knowledge/domain/knowledge-error";
import { getPartyContextSnapshot } from "@/modules/organizations/application/party-context-service";

const RESOLUTION_CONVERSION_WINDOW_MS = 24 * 60 * 60 * 1000;

type JourneyIdentity = {
  partyId: number;
  partyKeyHash: string;
  organizationId: number | null;
};

type JourneyRecord = {
  id: string;
  status: SupportJourneyStatus;
  startedAt: Date;
  contentShownAt: Date | null;
  confirmedResolvedAt: Date | null;
  conversionDeadlineAt: Date | null;
  outcomeFinalizedAt: Date | null;
  convertedTicketId: number | null;
  customerQuestion?: string | null;
};

type JourneyMessageRecord = {
  id: bigint;
  author: "CUSTOMER" | "SYSTEM";
  kind: "QUESTION" | "GUIDANCE" | "OUTCOME" | "HANDOFF";
  body: string;
  createdAt: Date;
};

function toJourneyDto(journey: JourneyRecord) {
  return {
    id: journey.id,
    status: journey.status,
    startedAt: journey.startedAt.toISOString(),
    contentShownAt: journey.contentShownAt?.toISOString() ?? null,
    confirmedResolvedAt: journey.confirmedResolvedAt?.toISOString() ?? null,
    conversionDeadlineAt: journey.conversionDeadlineAt?.toISOString() ?? null,
    outcomeFinalizedAt: journey.outcomeFinalizedAt?.toISOString() ?? null,
    convertedToTicket: journey.convertedTicketId !== null,
    customerQuestion: journey.customerQuestion ?? null,
  };
}

function toConversationDto(messages: readonly JourneyMessageRecord[]) {
  return messages.map((message) => ({
    id: message.id.toString(),
    author: message.author,
    kind: message.kind,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  }));
}

async function activeJourneyIdentity(user: CurrentUser): Promise<JourneyIdentity> {
  const snapshot = await getPartyContextSnapshot(user);
  const context = snapshot.contexts.find(
    (candidate) => candidate.partyId === snapshot.activePartyId
  );
  if (!context) throw new KnowledgeError("طرف حساب فعال یافت نشد", "NOT_FOUND", 404);
  return {
    partyId: context.partyId,
    partyKeyHash: hashSecurityValue("support-journey-party", String(context.partyId)),
    organizationId: context.organization?.id ?? null,
  };
}

async function verifySessionContext(
  transaction: Prisma.TransactionClient,
  user: CurrentUser,
  identity: JourneyIdentity,
  now: Date
): Promise<void> {
  const session = await transaction.session.findFirst({
    where: {
      id: user.sessionId,
      userId: user.id,
      activePartyId: identity.partyId,
      revokedAt: null,
      expiresAt: { gt: now },
      absoluteExpiresAt: { gt: now },
    },
    select: { id: true },
  });
  if (!session) {
    throw new KnowledgeError("نشست یا طرف حساب فعال معتبر نیست", "NOT_FOUND", 404);
  }
}

async function activeDefinitionVersion(
  transaction: Prisma.TransactionClient
): Promise<string> {
  const definition = await transaction.kpiDefinitionVersion.findUnique({
    where: { activeKey: "SUPPORT_KPI" },
    select: { version: true, status: true },
  });
  if (!definition || definition.status !== "ACTIVE") {
    throw new KnowledgeError(
      "نسخه فعال قرارداد گزارش‌گیری در دسترس نیست",
      "DEPENDENCY_UNAVAILABLE",
      503
    );
  }
  return definition.version;
}

async function replayStartedJourney(input: {
  keyHash: string;
  payloadHash: string;
  partyKeyHash: string;
}) {
  const journey = await prisma.supportJourney.findUnique({
    where: { startCommandKeyHash: input.keyHash },
    include: {
      messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      knowledgeArticleVersion: {
        select: {
          title: true,
          body: true,
          version: true,
          article: {
            select: {
              id: true,
              slug: true,
              service: { select: { id: true, code: true, name: true } },
              requestType: { select: { id: true, code: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!journey) return null;
  if (
    journey.startPayloadHash !== input.payloadHash ||
    journey.partyKeyHash !== input.partyKeyHash
  ) {
    throw new KnowledgeError(
      "کلید تکرار با محتوای متفاوت استفاده شده است",
      "IDEMPOTENCY_KEY_REUSED",
      409
    );
  }
  if (!journey.knowledgeArticleVersion) {
    throw new KnowledgeError("محتوای Journey در دسترس نیست", "CONFLICT", 409);
  }
  return {
    journey: toJourneyDto(journey),
    article: {
      id: journey.knowledgeArticleVersion.article.id,
      slug: journey.knowledgeArticleVersion.article.slug,
      version: journey.knowledgeArticleVersion.version,
      title: journey.knowledgeArticleVersion.title,
      body: journey.knowledgeArticleVersion.body,
      service: journey.knowledgeArticleVersion.article.service,
      requestType: journey.knowledgeArticleVersion.article.requestType,
    },
    conversation: toConversationDto(journey.messages),
    replayed: true,
  };
}

export async function startKnowledgeJourney(input: {
  user: CurrentUser;
  articleId: number;
  question?: string;
  idempotencyKey: string;
  now?: Date;
}) {
  const identity = await activeJourneyIdentity(input.user);
  const keyHash = hashSecurityValue(
    "support-journey-start-key",
    `${identity.partyId}:${input.idempotencyKey}`
  );
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ articleId: input.articleId, question: input.question ?? null }))
    .digest("hex");
  const replay = await replayStartedJourney({
    keyHash,
    payloadHash,
    partyKeyHash: identity.partyKeyHash,
  });
  if (replay) return replay;

  const now = input.now ?? new Date();
  try {
    return await runSerializableTransaction(async (transaction) => {
      await verifySessionContext(transaction, input.user, identity, now);
      const definitionVersion = await activeDefinitionVersion(transaction);
      const article = await transaction.knowledgeArticle.findFirst({
        where: {
          id: input.articleId,
          status: "ACTIVE",
          audience: "PUBLIC",
          publishedVersionId: { not: null },
        },
        include: {
          publishedVersion: true,
          service: { select: { id: true, code: true, name: true } },
          requestType: {
            select: {
              id: true,
              code: true,
              name: true,
              routes: {
                where: { activeKey: { not: null }, status: "ACTIVE" },
                orderBy: { version: "desc" },
                take: 1,
                select: { queue: { select: { teamId: true } } },
              },
            },
          },
        },
      });
      if (
        !article?.publishedVersion ||
        article.publishedVersion.approvalStatus !== "APPROVED" ||
        !article.publishedVersion.publishedAt
      ) {
        throw new KnowledgeError("مقاله عمومی فعال یافت نشد", "NOT_FOUND", 404);
      }

      const journey = await transaction.supportJourney.create({
        data: {
          id: randomUUID(),
          definitionVersion,
          partyKeyHash: identity.partyKeyHash,
          organizationId: identity.organizationId,
          serviceId: article.serviceId,
          serviceCode: article.service?.code ?? null,
          requestTypeId: article.requestTypeId,
          requestTypeCode: article.requestType?.code ?? null,
          supportTeamId: article.requestType?.routes[0]?.queue.teamId ?? null,
          channel: "WEB",
          status: "CONTENT_SHOWN",
          contentType: "KNOWLEDGE_ARTICLE",
          contentReference: `knowledge-article:${article.id}:version:${article.publishedVersion.version}`,
          customerQuestion: input.question?.trim() || null,
          contentIsPublicApprovedActive: true,
          knowledgeArticleVersionId: article.publishedVersion.id,
          startCommandKeyHash: keyHash,
          startPayloadHash: payloadHash,
          startedAt: now,
          contentShownAt: now,
          messages: {
            create: [
              ...(input.question?.trim()
                ? [
                    {
                      author: "CUSTOMER" as const,
                      kind: "QUESTION" as const,
                      body: input.question.trim(),
                      createdAt: now,
                    },
                  ]
                : []),
              {
                author: "SYSTEM" as const,
                kind: "GUIDANCE" as const,
                body: article.publishedVersion.body,
                createdAt: now,
              },
            ],
          },
        },
        include: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
      });
      await appendKnowledgeEvent(transaction, {
        aggregateType: "SUPPORT_JOURNEY",
        aggregateId: journey.id,
        eventType: "support.journey_started.v1",
        occurredAt: now,
        payload: {
          definitionVersion,
          articleId: article.id,
          articleVersionId: article.publishedVersion.id.toString(),
          organizationId: identity.organizationId,
          serviceId: article.serviceId,
          requestTypeId: article.requestTypeId,
          supportTeamId: article.requestType?.routes[0]?.queue.teamId ?? null,
          channel: "WEB",
          eligible: true,
          customerQuestion: input.question?.trim() || null,
        },
      });
      return {
        journey: toJourneyDto(journey),
        article: {
          id: article.id,
          slug: article.slug,
          version: article.publishedVersion.version,
          title: article.publishedVersion.title,
          body: article.publishedVersion.body,
          service: article.service,
          requestType: article.requestType
            ? {
                id: article.requestType.id,
                code: article.requestType.code,
                name: article.requestType.name,
              }
            : null,
        },
        conversation: toConversationDto(journey.messages),
        replayed: false,
      };
    });
  } catch (error) {
    if (getPersistenceErrorCode(error) !== "P2002") throw error;
    const racedReplay = await replayStartedJourney({
      keyHash,
      payloadHash,
      partyKeyHash: identity.partyKeyHash,
    });
    if (!racedReplay) throw error;
    return racedReplay;
  }
}

async function loadOwnedJourney(
  journeyId: string,
  partyKeyHash: string
) {
  const journey = await prisma.supportJourney.findFirst({
    where: { id: journeyId, partyKeyHash },
  });
  if (!journey) throw new KnowledgeError("Journey یافت نشد", "NOT_FOUND", 404);
  return journey;
}

export async function getOwnedKnowledgeJourney(input: {
  user: CurrentUser;
  journeyId: string;
}) {
  const identity = await activeJourneyIdentity(input.user);
  const journey = await prisma.supportJourney.findFirst({
    where: { id: input.journeyId, partyKeyHash: identity.partyKeyHash },
    include: {
      messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      knowledgeArticleVersion: {
        select: {
          title: true,
          article: {
            select: {
              requestType: { select: { id: true, code: true, name: true } },
              service: { select: { id: true, code: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!journey) throw new KnowledgeError("Journey یافت نشد", "NOT_FOUND", 404);
  return {
    journey: toJourneyDto(journey),
    context: {
      question: journey.customerQuestion,
      articleTitle: journey.knowledgeArticleVersion?.title ?? null,
      requestType: journey.knowledgeArticleVersion?.article.requestType ?? null,
      service: journey.knowledgeArticleVersion?.article.service ?? null,
      conversation: toConversationDto(journey.messages),
    },
  };
}

export async function confirmKnowledgeResolution(input: {
  user: CurrentUser;
  journeyId: string;
  idempotencyKey: string;
  now?: Date;
}) {
  const identity = await activeJourneyIdentity(input.user);
  const keyHash = hashSecurityValue(
    "support-journey-confirm-key",
    `${input.journeyId}:${input.idempotencyKey}`
  );
  const existing = await loadOwnedJourney(input.journeyId, identity.partyKeyHash);
  if (existing.confirmationCommandKeyHash === keyHash) {
    return { journey: toJourneyDto(existing), replayed: true };
  }
  if (existing.confirmationCommandKeyHash) {
    throw new KnowledgeError("نتیجه Journey قبلاً ثبت شده است", "CONFLICT", 409);
  }
  if (existing.status !== "CONTENT_SHOWN") {
    throw new KnowledgeError("Journey قابل تأیید نیست", "CONFLICT", 409);
  }

  const now = input.now ?? new Date();
  const conversionDeadlineAt = new Date(
    now.getTime() + RESOLUTION_CONVERSION_WINDOW_MS
  );
  try {
    return await runSerializableTransaction(async (transaction) => {
      await verifySessionContext(transaction, input.user, identity, now);
      const updated = await transaction.supportJourney.updateMany({
        where: {
          id: input.journeyId,
          partyKeyHash: identity.partyKeyHash,
          status: "CONTENT_SHOWN",
          confirmationCommandKeyHash: null,
        },
        data: {
          status: "CONFIRMED_RESOLVED",
          confirmedResolvedAt: now,
          conversionDeadlineAt,
          confirmationCommandKeyHash: keyHash,
        },
      });
      if (updated.count !== 1) {
        throw new KnowledgeError("Journey هم‌زمان تغییر کرده است", "CONFLICT", 409);
      }
      const journey = await transaction.supportJourney.findUniqueOrThrow({
        where: { id: input.journeyId },
      });
      await transaction.supportJourneyMessage.create({
        data: {
          journeyId: journey.id,
          author: "CUSTOMER",
          kind: "OUTCOME",
          body: "کاربر اعلام کرد راهنمای پیشنهادی مشکل را حل کرده است.",
          createdAt: now,
        },
      });
      await appendKnowledgeEvent(transaction, {
        aggregateType: "SUPPORT_JOURNEY",
        aggregateId: journey.id,
        eventType: "support.resolution_confirmed.v1",
        occurredAt: now,
        payload: { conversionDeadlineAt: conversionDeadlineAt.toISOString() },
      });
      return { journey: toJourneyDto(journey), replayed: false };
    });
  } catch (error) {
    if (getPersistenceErrorCode(error) !== "P2002") throw error;
    const replay = await loadOwnedJourney(input.journeyId, identity.partyKeyHash);
    if (replay.confirmationCommandKeyHash !== keyHash) throw error;
    return { journey: toJourneyDto(replay), replayed: true };
  }
}

export async function linkSupportJourneyToTicket(
  transaction: Prisma.TransactionClient,
  input: {
    journeyId: string;
    partyId: number;
    ticketId: number;
    requestTypeId: number;
    now: Date;
  }
): Promise<{ linked: boolean; maturedBeforeTicket: boolean }> {
  const ticket = await transaction.ticket.findFirst({
    where: {
      id: input.ticketId,
      partyId: input.partyId,
      requestTypeId: input.requestTypeId,
    },
    select: { id: true },
  });
  if (!ticket) {
    throw new KnowledgeError("تیکت مقصد با Journey سازگار نیست", "CONFLICT", 409);
  }
  const partyKeyHash = hashSecurityValue(
    "support-journey-party",
    String(input.partyId)
  );
  const journey = await transaction.supportJourney.findFirst({
    where: { id: input.journeyId, partyKeyHash },
  });
  if (!journey) throw new KnowledgeError("Journey یافت نشد", "NOT_FOUND", 404);
  if (!journey.contentIsPublicApprovedActive || !journey.knowledgeArticleVersionId) {
    throw new KnowledgeError("Journey واجد شرایط اتصال نیست", "CONFLICT", 409);
  }
  if (journey.requestTypeId && journey.requestTypeId !== input.requestTypeId) {
    throw new KnowledgeError(
      "Journey با نوع درخواست انتخاب‌شده سازگار نیست",
      "BUSINESS_RULE_VIOLATION",
      422
    );
  }
  if (journey.convertedTicketId === input.ticketId) {
    return { linked: true, maturedBeforeTicket: false };
  }
  if (journey.convertedTicketId) {
    throw new KnowledgeError("Journey قبلاً به تیکت دیگری متصل شده است", "CONFLICT", 409);
  }
  if (
    journey.status === "CONFIRMED_RESOLVED" &&
    journey.conversionDeadlineAt &&
    journey.conversionDeadlineAt < input.now
  ) {
    await transaction.supportJourney.update({
      where: { id: journey.id },
      data: { outcomeFinalizedAt: journey.outcomeFinalizedAt ?? input.now },
    });
    return { linked: false, maturedBeforeTicket: true };
  }
  if (!(["CONTENT_SHOWN", "CONFIRMED_RESOLVED"] as SupportJourneyStatus[]).includes(journey.status)) {
    throw new KnowledgeError("Journey قابل تبدیل به تیکت نیست", "CONFLICT", 409);
  }

  await transaction.supportJourney.update({
    where: { id: journey.id },
    data: {
      status: "CONVERTED_TO_TICKET",
      convertedTicketId: input.ticketId,
      outcomeFinalizedAt: input.now,
    },
  });
  await transaction.supportJourneyMessage.create({
    data: {
      journeyId: journey.id,
      author: "SYSTEM",
      kind: "HANDOFF",
      body: "گفت‌وگوی راهنمای خودکار برای ادامه بررسی به تیکت پشتیبانی منتقل شد.",
      createdAt: input.now,
    },
  });
  await appendKnowledgeEvent(transaction, {
    aggregateType: "SUPPORT_JOURNEY",
    aggregateId: journey.id,
    eventType: "support.converted_to_ticket.v1",
    occurredAt: input.now,
    payload: { ticketId: input.ticketId },
  });
  return { linked: true, maturedBeforeTicket: false };
}

export async function finalizeMaturedSupportJourneys(input: {
  limit: number;
  now?: Date;
  journeyId?: string;
}) {
  const limit = Math.min(Math.max(Math.trunc(input.limit), 1), 500);
  const now = input.now ?? new Date();
  return runSerializableTransaction(async (transaction) => {
    const candidates = await transaction.supportJourney.findMany({
      where: {
        ...(input.journeyId ? { id: input.journeyId } : {}),
        status: "CONFIRMED_RESOLVED",
        conversionDeadlineAt: { lte: now },
        outcomeFinalizedAt: null,
        convertedTicketId: null,
      },
      orderBy: [{ conversionDeadlineAt: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true },
    });
    let finalized = 0;
    for (const candidate of candidates) {
      const updated = await transaction.supportJourney.updateMany({
        where: {
          id: candidate.id,
          status: "CONFIRMED_RESOLVED",
          conversionDeadlineAt: { lte: now },
          outcomeFinalizedAt: null,
          convertedTicketId: null,
        },
        data: { outcomeFinalizedAt: now },
      });
      if (updated.count !== 1) continue;
      finalized += 1;
      await appendKnowledgeEvent(transaction, {
        aggregateType: "SUPPORT_JOURNEY",
        aggregateId: candidate.id,
        eventType: "support.outcome_finalized.v1",
        occurredAt: now,
        payload: { outcome: "AUTOMATED_RESOLUTION_CONFIRMED" },
      });
    }
    return { finalized, hasMore: candidates.length === limit };
  });
}
