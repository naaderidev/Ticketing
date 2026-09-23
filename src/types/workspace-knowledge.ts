export type KnowledgeAudience = "PUBLIC" | "AUTHENTICATED" | "ORGANIZATION";
export type KnowledgeArticleStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type KnowledgeApprovalStatus = "DRAFT" | "APPROVED" | "REJECTED";

export type WorkspaceKnowledgeVersion = {
  version: number;
  title: string;
  body: string;
  approvalStatus: KnowledgeApprovalStatus;
  approvedAt: string | null;
  publishedAt: string | null;
};

export type WorkspaceKnowledgeArticle = {
  id: number;
  slug: string;
  audience: KnowledgeAudience;
  status: KnowledgeArticleStatus;
  serviceId: number | null;
  requestTypeId: number | null;
  keywords: string[];
  service: { id: number; code: string; name: string } | null;
  requestType: { id: number; code: string; name: string } | null;
  publishedVersionId: string | null;
  version: WorkspaceKnowledgeVersion | null;
  publishedVersion: WorkspaceKnowledgeVersion | null;
};

export type KnowledgeArticleDraftCommand = {
  title: string;
  body: string;
  keywords: string[];
  audience: KnowledgeAudience;
  serviceId?: number;
  requestTypeId?: number;
};

export type CreateKnowledgeArticleCommand = KnowledgeArticleDraftCommand & {
  slug: string;
};
