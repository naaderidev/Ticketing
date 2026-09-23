import { createHash, randomUUID } from "node:crypto";
import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import {
  confirmKnowledgeResolution,
  finalizeMaturedSupportJourneys,
  linkSupportJourneyToTicket,
  startKnowledgeJourney,
} from "@/modules/knowledge/application/support-journey-service";

const runIntegration =
  process.env.RUN_AUTOMATED_RESOLUTION_INTEGRATION === "1" ? it : it.skip;

describe("automated-resolution database integration", () => {
  const journeyIds: string[] = [];
  let articleId: number | null = null;
  let versionId: bigint | null = null;
  let sessionId: string | null = null;

  afterAll(async () => {
    if (journeyIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
        where: { aggregateType: "SUPPORT_JOURNEY", aggregateId: { in: journeyIds } },
      });
      await prisma.supportJourney.deleteMany({ where: { id: { in: journeyIds } } });
    }
    if (articleId) {
      await prisma.outboxEvent.deleteMany({
        where: { aggregateType: "KNOWLEDGE_ARTICLE", aggregateId: String(articleId) },
      });
      await prisma.knowledgeArticle.update({
        where: { id: articleId },
        data: { status: "ARCHIVED", publishedVersionId: null },
      });
    }
    if (versionId) {
      await prisma.knowledgeArticleVersion.delete({ where: { id: versionId } });
    }
    if (articleId) {
      await prisma.knowledgeArticle.delete({ where: { id: articleId } });
    }
    if (sessionId) await prisma.session.deleteMany({ where: { id: sessionId } });
    await prisma.$disconnect();
  });

  runIntegration("captures confirmation, maturity and ticket conversion without leaking party identity", async () => {
    const ticket = await prisma.ticket.findFirst({
      where: {
        party: { type: "PERSON" },
        partyId: { not: null },
        requestTypeId: { not: null },
        createdById: { not: null },
      },
      select: {
        id: true,
        partyId: true,
        requestTypeId: true,
        createdBy: {
          select: {
            id: true,
            mobile: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        requestType: { select: { serviceId: true } },
      },
    });
    if (!ticket?.partyId || !ticket.requestTypeId || !ticket.createdBy || !ticket.requestType) {
      throw new Error("Local seed has no compatible personal ticket");
    }

    sessionId = randomUUID();
    const now = new Date();
    await prisma.session.create({
      data: {
        id: sessionId,
        userId: ticket.createdBy.id,
        activePartyId: ticket.partyId,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1_000),
        absoluteExpiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1_000),
      },
    });
    const user: CurrentUser = { ...ticket.createdBy, sessionId };

    const article = await prisma.knowledgeArticle.create({
      data: {
        slug: `automated-resolution-test-${randomUUID()}`,
        audience: "PUBLIC",
        status: "DRAFT",
        serviceId: ticket.requestType.serviceId,
        requestTypeId: ticket.requestTypeId,
      },
    });
    articleId = article.id;
    const title = "راهنمای آزمایشی حل خودکار";
    const body = "این محتوا فقط برای آزمون یکپارچگی ساخته شده است.";
    const version = await prisma.knowledgeArticleVersion.create({
      data: {
        articleId: article.id,
        version: 1,
        title,
        body,
        approvalStatus: "APPROVED",
        approvedAt: now,
        publishedAt: now,
        contentChecksum: createHash("sha256")
          .update(`${title}\n${body}`)
          .digest("hex"),
      },
    });
    versionId = version.id;
    await prisma.knowledgeArticle.update({
      where: { id: article.id },
      data: { status: "ACTIVE", publishedVersionId: version.id },
    });

    const started = await startKnowledgeJourney({
      user,
      articleId: article.id,
      idempotencyKey: "automated-start-test-0001",
      now,
    });
    journeyIds.push(started.journey.id);
    expect(started).toMatchObject({
      replayed: false,
      journey: { status: "CONTENT_SHOWN" },
      article: { id: article.id, version: 1 },
    });
    const replayedStart = await startKnowledgeJourney({
      user,
      articleId: article.id,
      idempotencyKey: "automated-start-test-0001",
      now,
    });
    expect(replayedStart.replayed).toBe(true);

    const confirmedAt = new Date(now.getTime() + 60_000);
    const confirmed = await confirmKnowledgeResolution({
      user,
      journeyId: started.journey.id,
      idempotencyKey: "automated-confirm-test-01",
      now: confirmedAt,
    });
    expect(confirmed.journey.status).toBe("CONFIRMED_RESOLVED");
    expect(
      (
        await confirmKnowledgeResolution({
          user,
          journeyId: started.journey.id,
          idempotencyKey: "automated-confirm-test-01",
          now: confirmedAt,
        })
      ).replayed
    ).toBe(true);

    const matured = await finalizeMaturedSupportJourneys({
      limit: 1,
      journeyId: started.journey.id,
      now: new Date(confirmedAt.getTime() + 24 * 60 * 60 * 1_000 + 1),
    });
    expect(matured.finalized).toBe(1);
    expect(
      await prisma.supportJourney.findUnique({
        where: { id: started.journey.id },
        select: { outcomeFinalizedAt: true, partyKeyHash: true },
      })
    ).toMatchObject({
      outcomeFinalizedAt: expect.any(Date),
      partyKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    const conversion = await startKnowledgeJourney({
      user,
      articleId: article.id,
      idempotencyKey: "automated-start-test-0002",
      now,
    });
    journeyIds.push(conversion.journey.id);
    const linked = await prisma.$transaction((transaction) =>
      linkSupportJourneyToTicket(transaction, {
        journeyId: conversion.journey.id,
        partyId: ticket.partyId!,
        ticketId: ticket.id,
        requestTypeId: ticket.requestTypeId!,
        now,
      })
    );
    expect(linked).toEqual({ linked: true, maturedBeforeTicket: false });
    expect(
      await prisma.supportJourney.findUnique({
        where: { id: conversion.journey.id },
        select: { status: true, convertedTicketId: true },
      })
    ).toEqual({ status: "CONVERTED_TO_TICKET", convertedTicketId: ticket.id });
  });
});
