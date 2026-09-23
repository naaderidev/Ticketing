import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/current-user";
import { runSerializableTransaction } from "@/lib/database-transaction";
import { getPersistenceErrorCode } from "@/lib/domain-error";
import { prisma } from "@/lib/prisma";
import type {
  CreateKnowledgeArticleInput,
  PublishKnowledgeArticleInput,
  UpdateKnowledgeArticleInput,
  WorkspaceKnowledgeArticleQuery,
} from "@/modules/knowledge/contracts/knowledge-schemas";
import {
  KNOWLEDGE_PERMISSIONS,
  hasGlobalKnowledgePermission,
} from "@/modules/knowledge/application/knowledge-authorization";
import { appendKnowledgeEvent } from "@/modules/knowledge/application/knowledge-outbox";
import { KnowledgeError } from "@/modules/knowledge/domain/knowledge-error";

function contentChecksum(title: string, body: string): string {
  return createHash("sha256").update(`${title}\n${body}`).digest("hex");
}

function serializeKeywords(keywords: readonly string[]): string | null {
  const normalized = keywords.map((keyword) => keyword.trim()).filter(Boolean);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

function deserializeKeywords(value: string | null | undefined): string[] {
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

function toArticleDto(article: {
  id: number;
  slug: string;
  audience: string;
  status: string;
  serviceId: number | null;
  requestTypeId: number | null;
  searchKeywords?: string | null;
  publishedVersionId: bigint | null;
  service?: { id: number; code: string; name: string } | null;
  requestType?: { id: number; code: string; name: string } | null;
  publishedVersion?: {
    version: number;
    title: string;
    body: string;
    approvalStatus: string;
    approvedAt: Date | null;
    publishedAt: Date | null;
  } | null;
  versions: Array<{
    version: number;
    title: string;
    body: string;
    approvalStatus: string;
    approvedAt: Date | null;
    publishedAt: Date | null;
  }>;
}) {
  return {
    id: article.id,
    slug: article.slug,
    audience: article.audience,
    status: article.status,
    serviceId: article.serviceId,
    requestTypeId: article.requestTypeId,
    keywords: deserializeKeywords(article.searchKeywords),
    service: article.service ?? null,
    requestType: article.requestType ?? null,
    publishedVersionId: article.publishedVersionId?.toString() ?? null,
    version: article.versions[0]
      ? {
          ...article.versions[0],
          approvedAt: article.versions[0].approvedAt?.toISOString() ?? null,
          publishedAt: article.versions[0].publishedAt?.toISOString() ?? null,
        }
      : null,
    publishedVersion: article.publishedVersion
      ? {
          ...article.publishedVersion,
          approvedAt: article.publishedVersion.approvedAt?.toISOString() ?? null,
          publishedAt: article.publishedVersion.publishedAt?.toISOString() ?? null,
        }
      : null,
  };
}

async function requirePermission(
  userId: number,
  permission: string
): Promise<void> {
  if (!(await hasGlobalKnowledgePermission(userId, permission))) {
    throw new KnowledgeError(
      "دسترسی لازم برای مدیریت محتوای دانش وجود ندارد",
      "FORBIDDEN",
      403
    );
  }
}

async function resolveCatalogScope(
  transaction: Prisma.TransactionClient,
  input: Pick<CreateKnowledgeArticleInput, "serviceId" | "requestTypeId">
) {
  if (input.requestTypeId) {
    const requestType = await transaction.supportRequestType.findFirst({
      where: { id: input.requestTypeId, status: "ACTIVE" },
      select: { id: true, serviceId: true },
    });
    if (!requestType) {
      throw new KnowledgeError("نوع درخواست فعال یافت نشد", "NOT_FOUND", 404);
    }
    if (input.serviceId && input.serviceId !== requestType.serviceId) {
      throw new KnowledgeError(
        "نوع درخواست به خدمت انتخاب‌شده تعلق ندارد",
        "BUSINESS_RULE_VIOLATION",
        422
      );
    }
    return { serviceId: requestType.serviceId, requestTypeId: requestType.id };
  }

  if (!input.serviceId) return { serviceId: null, requestTypeId: null };
  const service = await transaction.supportService.findFirst({
    where: { id: input.serviceId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!service) throw new KnowledgeError("خدمت فعال یافت نشد", "NOT_FOUND", 404);
  return { serviceId: service.id, requestTypeId: null };
}

export async function listWorkspaceKnowledgeArticles(input: {
  user: CurrentUser;
  query: WorkspaceKnowledgeArticleQuery;
}) {
  const canRead =
    (await hasGlobalKnowledgePermission(input.user.id, KNOWLEDGE_PERMISSIONS.MANAGE)) ||
    (await hasGlobalKnowledgePermission(input.user.id, KNOWLEDGE_PERMISSIONS.PUBLISH));
  if (!canRead) {
    throw new KnowledgeError(
      "دسترسی لازم برای مشاهده محتوای دانش وجود ندارد",
      "FORBIDDEN",
      403
    );
  }
  const search = input.query.q.trim();
  const articles = await prisma.knowledgeArticle.findMany({
    where: {
      ...(input.query.status === "ALL" ? {} : { status: input.query.status }),
      ...(search
        ? {
            OR: [
              { slug: { contains: search } },
              { searchKeywords: { contains: search } },
              { versions: { some: { OR: [{ title: { contains: search } }, { body: { contains: search } }] } } },
            ],
          }
        : {}),
    },
    include: {
      service: { select: { id: true, code: true, name: true } },
      requestType: { select: { id: true, code: true, name: true } },
      publishedVersion: {
        select: {
          version: true,
          title: true,
          body: true,
          approvalStatus: true,
          approvedAt: true,
          publishedAt: true,
        },
      },
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        select: {
          version: true,
          title: true,
          body: true,
          approvalStatus: true,
          approvedAt: true,
          publishedAt: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: input.query.limit,
  });
  return articles.map(toArticleDto);
}

export async function createKnowledgeArticle(input: {
  user: CurrentUser;
  command: CreateKnowledgeArticleInput;
}) {
  await requirePermission(input.user.id, KNOWLEDGE_PERMISSIONS.MANAGE);
  try {
    return await runSerializableTransaction(async (transaction) => {
      const scope = await resolveCatalogScope(transaction, input.command);
      const article = await transaction.knowledgeArticle.create({
        data: {
          slug: input.command.slug,
          audience: input.command.audience,
          searchKeywords: serializeKeywords(input.command.keywords),
          serviceId: scope.serviceId,
          requestTypeId: scope.requestTypeId,
          createdById: input.user.id,
          versions: {
            create: {
              version: 1,
              title: input.command.title,
              body: input.command.body,
              contentChecksum: contentChecksum(
                input.command.title,
                input.command.body
              ),
            },
          },
        },
        include: {
          service: { select: { id: true, code: true, name: true } },
          requestType: { select: { id: true, code: true, name: true } },
          publishedVersion: true,
          versions: { where: { version: 1 }, take: 1 },
        },
      });
      return toArticleDto(article);
    });
  } catch (error) {
    if (getPersistenceErrorCode(error) === "P2002") {
      throw new KnowledgeError("نامک مقاله قبلاً استفاده شده است", "CONFLICT", 409);
    }
    throw error;
  }
}

export async function updateKnowledgeArticle(input: {
  user: CurrentUser;
  articleId: number;
  command: UpdateKnowledgeArticleInput;
}) {
  await requirePermission(input.user.id, KNOWLEDGE_PERMISSIONS.MANAGE);
  return runSerializableTransaction(async (transaction) => {
    const existing = await transaction.knowledgeArticle.findUnique({
      where: { id: input.articleId },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!existing) throw new KnowledgeError("مقاله یافت نشد", "NOT_FOUND", 404);
    if (existing.status === "ARCHIVED") {
      throw new KnowledgeError("مقاله بایگانی‌شده قابل ویرایش نیست", "CONFLICT", 409);
    }
    const scope = await resolveCatalogScope(transaction, input.command);
    const latestVersion = existing.versions[0];
    const checksum = contentChecksum(input.command.title, input.command.body);
    const canReplaceDraft =
      latestVersion?.approvalStatus === "DRAFT" &&
      latestVersion.id !== existing.publishedVersionId;
    const nextVersion = canReplaceDraft
      ? await transaction.knowledgeArticleVersion.update({
          where: { id: latestVersion.id },
          data: {
            title: input.command.title,
            body: input.command.body,
            contentChecksum: checksum,
          },
        })
      : await transaction.knowledgeArticleVersion.create({
          data: {
            articleId: existing.id,
            version: (latestVersion?.version ?? 0) + 1,
            title: input.command.title,
            body: input.command.body,
            contentChecksum: checksum,
          },
        });
    const article = await transaction.knowledgeArticle.update({
      where: { id: existing.id },
      data: {
        audience: input.command.audience,
        serviceId: scope.serviceId,
        requestTypeId: scope.requestTypeId,
        searchKeywords: serializeKeywords(input.command.keywords),
      },
      include: {
        service: { select: { id: true, code: true, name: true } },
        requestType: { select: { id: true, code: true, name: true } },
        publishedVersion: {
          select: {
            version: true,
            title: true,
            body: true,
            approvalStatus: true,
            approvedAt: true,
            publishedAt: true,
          },
        },
        versions: {
          where: { id: nextVersion.id },
          take: 1,
          select: {
            version: true,
            title: true,
            body: true,
            approvalStatus: true,
            approvedAt: true,
            publishedAt: true,
          },
        },
      },
    });
    return toArticleDto(article);
  });
}

export async function publishKnowledgeArticle(input: {
  user: CurrentUser;
  articleId: number;
  command: PublishKnowledgeArticleInput;
}) {
  await requirePermission(input.user.id, KNOWLEDGE_PERMISSIONS.PUBLISH);
  return runSerializableTransaction(async (transaction) => {
    const article = await transaction.knowledgeArticle.findUnique({
      where: { id: input.articleId },
      include: {
        versions: { where: { version: input.command.version }, take: 1 },
      },
    });
    if (!article) throw new KnowledgeError("مقاله یافت نشد", "NOT_FOUND", 404);
    const version = article.versions[0];
    if (!version) throw new KnowledgeError("نسخه مقاله یافت نشد", "NOT_FOUND", 404);
    if (
      article.status === "ACTIVE" &&
      article.publishedVersionId === version.id &&
      version.approvalStatus === "APPROVED"
    ) {
      return { article: toArticleDto(article), replayed: true };
    }
    if (article.status === "ARCHIVED") {
      throw new KnowledgeError("مقاله بایگانی‌شده قابل انتشار نیست", "CONFLICT", 409);
    }
    if (article.audience === "PUBLIC" && !article.requestTypeId) {
      throw new KnowledgeError(
        "برای انتشار عمومی، اتصال مقاله به نوع درخواست الزامی است",
        "BUSINESS_RULE_VIOLATION",
        422
      );
    }
    if (version.approvalStatus !== "DRAFT") {
      throw new KnowledgeError("نسخه انتخاب‌شده قابل تأیید نیست", "CONFLICT", 409);
    }

    const now = new Date();
    await transaction.knowledgeArticleVersion.update({
      where: { id: version.id },
      data: {
        approvalStatus: "APPROVED",
        approvedById: input.user.id,
        approvedAt: now,
        publishedAt: now,
      },
    });
    const updated = await transaction.knowledgeArticle.update({
      where: { id: article.id },
      data: { status: "ACTIVE", publishedVersionId: version.id },
      include: {
        versions: { where: { id: version.id }, take: 1 },
      },
    });
    await appendKnowledgeEvent(transaction, {
      aggregateType: "KNOWLEDGE_ARTICLE",
      aggregateId: String(article.id),
      eventType: "knowledge.article_published.v1",
      occurredAt: now,
      payload: {
        articleId: article.id,
        articleVersionId: version.id.toString(),
        version: version.version,
        audience: article.audience,
        serviceId: article.serviceId,
        requestTypeId: article.requestTypeId,
      },
    });
    return { article: toArticleDto(updated), replayed: false };
  });
}

export async function archiveKnowledgeArticle(input: {
  user: CurrentUser;
  articleId: number;
}) {
  await requirePermission(input.user.id, KNOWLEDGE_PERMISSIONS.MANAGE);
  return runSerializableTransaction(async (transaction) => {
    const existing = await transaction.knowledgeArticle.findUnique({
      where: { id: input.articleId },
      select: { id: true, status: true },
    });
    if (!existing) throw new KnowledgeError("مقاله یافت نشد", "NOT_FOUND", 404);
    if (existing.status === "ARCHIVED") return { articleId: existing.id, replayed: true };
    await transaction.knowledgeArticle.update({
      where: { id: existing.id },
      data: { status: "ARCHIVED" },
    });
    await appendKnowledgeEvent(transaction, {
      aggregateType: "KNOWLEDGE_ARTICLE",
      aggregateId: String(existing.id),
      eventType: "knowledge.article_archived.v1",
      occurredAt: new Date(),
      payload: { articleId: existing.id },
    });
    return { articleId: existing.id, replayed: false };
  });
}
