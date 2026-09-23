import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import type { CustomerKnowledgeArticleQuery } from "@/modules/knowledge/contracts/knowledge-schemas";
import { scoreKnowledgeCandidate } from "@/modules/knowledge/domain/persian-knowledge-search";
import { getPartyContextSnapshot } from "@/modules/organizations/application/party-context-service";

const POPULARITY_WINDOW_DAYS = 90;

function excerpt(body: string): string {
  const normalized = body.replace(/\s+/g, " ").trim();
  return normalized.length <= 180 ? normalized : `${normalized.slice(0, 177)}…`;
}

function parseKeywords(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return value.split(/[،,\n]/).map((item) => item.trim()).filter(Boolean);
  }
}

export async function listCustomerKnowledgeArticles(input: {
  user: CurrentUser;
  query: CustomerKnowledgeArticleQuery;
  now?: Date;
}) {
  await getPartyContextSnapshot(input.user);
  const since = new Date(
    (input.now ?? new Date()).getTime() - POPULARITY_WINDOW_DAYS * 24 * 60 * 60_000
  );
  const search = input.query.q.trim();

  const articles = await prisma.knowledgeArticle.findMany({
    where: {
      status: "ACTIVE",
      audience: "PUBLIC",
      publishedVersionId: { not: null },
      publishedVersion: {
        approvalStatus: "APPROVED",
        publishedAt: { not: null },
      },
    },
    select: {
      id: true,
      slug: true,
      searchKeywords: true,
      service: { select: { id: true, code: true, name: true } },
      requestType: { select: { id: true, code: true, name: true } },
      publishedVersion: {
        select: {
          title: true,
          body: true,
          _count: { select: { supportJourneys: true } },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 200,
  });

  const requestTypeIds = articles.flatMap((article) =>
    article.requestType ? [article.requestType.id] : []
  );
  const ticketCounts = requestTypeIds.length
    ? await prisma.ticket.groupBy({
        by: ["requestTypeId"],
        where: {
          requestTypeId: { in: requestTypeIds },
          createdAt: { gte: since },
        },
        _count: { _all: true },
      })
    : [];
  const ticketCountByRequestType = new Map(
    ticketCounts.map((item) => [item.requestTypeId, item._count._all])
  );

  const ranked = articles
    .flatMap((article) => {
      const version = article.publishedVersion;
      if (!version) return [];
      const popularityScore =
        version._count.supportJourneys * 3 +
        (article.requestType
          ? (ticketCountByRequestType.get(article.requestType.id) ?? 0)
          : 0);
      return [
        {
          id: article.id,
          slug: article.slug,
          title: version.title,
          excerpt: excerpt(version.body),
          service: article.service,
          requestType: article.requestType,
          popularityScore,
          isFrequent: false,
          match: scoreKnowledgeCandidate(search, {
            title: version.title,
            body: version.body,
            keywords: parseKeywords(article.searchKeywords),
            serviceName: article.service?.name ?? null,
            requestTypeName: article.requestType?.name ?? null,
          }),
        },
      ];
    })
    .filter((article) => !search || article.match.score >= 0.14)
    .sort((left, right) => {
      if (search && right.match.score !== left.match.score) {
        return right.match.score - left.match.score;
      }
      return (
        right.popularityScore - left.popularityScore ||
        left.title.localeCompare(right.title, "fa")
      );
    })
    .slice(0, input.query.limit);

  return ranked.map((article, index) => {
    const { match, ...candidate } = article;
    return {
      ...candidate,
      matchScore: match.score,
      matchConfidence: match.confidence,
      matchReasons: match.reasons,
      isRecommended: Boolean(search) && index === 0 && match.confidence !== "LOW",
      detectedTopic: article.requestType?.name ?? article.service?.name ?? null,
      isFrequent: !search && index < 6,
    };
  });
}
