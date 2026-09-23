"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateKnowledgeArticleCommand,
  KnowledgeArticleDraftCommand,
  WorkspaceKnowledgeArticle,
} from "@/types/workspace-knowledge";

type ApiSuccess<T> = { data: T };
type ApiListSuccess<T> = { data: T[] };
type ApiFailure = { error?: { code?: string; message?: string; requestId?: string } };

export class WorkspaceKnowledgeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId: string | null
  ) {
    super(message);
    this.name = "WorkspaceKnowledgeError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) {
    let body: ApiFailure = {};
    try {
      body = (await response.json()) as ApiFailure;
    } catch {
      // The status and request id still provide an actionable failure.
    }
    throw new WorkspaceKnowledgeError(
      body.error?.message ?? "درخواست مدیریت دانش ناموفق بود",
      response.status,
      body.error?.code ?? "UNKNOWN_ERROR",
      body.error?.requestId ?? response.headers.get("x-request-id")
    );
  }
  return response.json() as Promise<T>;
}

const jsonHeaders = { "Content-Type": "application/json" } as const;

export function useWorkspaceKnowledgeArticles(query = "") {
  const params = new URLSearchParams({ q: query.trim(), status: "ALL", limit: "100" });
  return useQuery<WorkspaceKnowledgeArticle[]>({
    queryKey: ["workspace-knowledge-articles", query.trim()],
    queryFn: async () =>
      (
        await request<ApiListSuccess<WorkspaceKnowledgeArticle>>(
          `/api/v2/workspace/knowledge/articles?${params.toString()}`
        )
      ).data,
  });
}

export function useCreateWorkspaceKnowledgeArticle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (command: CreateKnowledgeArticleCommand) =>
      (
        await request<ApiSuccess<WorkspaceKnowledgeArticle>>(
          "/api/v2/workspace/knowledge/articles",
          { method: "POST", headers: jsonHeaders, body: JSON.stringify(command) }
        )
      ).data,
    onSuccess: async () => client.invalidateQueries({ queryKey: ["workspace-knowledge-articles"] }),
  });
}

export function useUpdateWorkspaceKnowledgeArticle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { articleId: number; command: KnowledgeArticleDraftCommand }) =>
      (
        await request<ApiSuccess<WorkspaceKnowledgeArticle>>(
          `/api/v2/workspace/knowledge/articles/${input.articleId}`,
          { method: "PUT", headers: jsonHeaders, body: JSON.stringify(input.command) }
        )
      ).data,
    onSuccess: async () => client.invalidateQueries({ queryKey: ["workspace-knowledge-articles"] }),
  });
}

export function usePublishWorkspaceKnowledgeArticle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { articleId: number; version: number }) =>
      (
        await request<ApiSuccess<{ article: WorkspaceKnowledgeArticle }>>(
          `/api/v2/workspace/knowledge/articles/${input.articleId}/publish`,
          { method: "POST", headers: jsonHeaders, body: JSON.stringify({ version: input.version }) }
        )
      ).data.article,
    onSuccess: async () => client.invalidateQueries({ queryKey: ["workspace-knowledge-articles"] }),
  });
}

export function useArchiveWorkspaceKnowledgeArticle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (articleId: number) =>
      request<ApiSuccess<{ articleId: number }>>(
        `/api/v2/workspace/knowledge/articles/${articleId}/archive`,
        { method: "POST", headers: jsonHeaders, body: "{}" }
      ),
    onSuccess: async () => client.invalidateQueries({ queryKey: ["workspace-knowledge-articles"] }),
  });
}
