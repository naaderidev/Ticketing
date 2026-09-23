"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CustomerApiError } from "@/hooks/customer-tickets-v2";
import type {
  CustomerKnowledgeArticle,
  CustomerKnowledgeConversationMessage,
  StartedKnowledgeJourney,
} from "@/types/customer-support-center";

type ApiSuccess<T> = { data: T };
type ApiListSuccess<T> = { data: T[] };
type ApiFailure = {
  error?: { code?: string; message?: string; requestId?: string };
};

async function readFailure(response: Response): Promise<CustomerApiError> {
  try {
    const body = (await response.json()) as ApiFailure;
    return new CustomerApiError(
      body.error?.message ?? "درخواست ناموفق بود",
      response.status,
      body.error?.code ?? "UNKNOWN_ERROR",
      body.error?.requestId ?? response.headers.get("x-request-id")
    );
  } catch {
    return new CustomerApiError(
      "ارتباط با سرور ناموفق بود",
      response.status,
      "INVALID_RESPONSE",
      response.headers.get("x-request-id")
    );
  }
}

async function fetchSupportCenter<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) throw await readFailure(response);
  return (await response.json()) as T;
}

export function useCustomerKnowledgeArticles(input: {
  query: string;
  activePartyId: number | undefined;
}) {
  const query = input.query.trim();
  const params = new URLSearchParams({ q: query, limit: "18" });
  return useQuery<CustomerKnowledgeArticle[]>({
    queryKey: ["customer-knowledge-articles", input.activePartyId, query],
    enabled: input.activePartyId !== undefined && (query.length === 0 || query.length >= 2),
    queryFn: async () =>
      (
        await fetchSupportCenter<ApiListSuccess<CustomerKnowledgeArticle>>(
          `/api/v2/knowledge/articles?${params.toString()}`
        )
      ).data,
  });
}

export function useStartKnowledgeJourney() {
  return useMutation({
    mutationFn: async (value: number | { articleId: number; question?: string }) => {
      const input = typeof value === "number" ? { articleId: value } : value;
      return (
        await fetchSupportCenter<ApiSuccess<StartedKnowledgeJourney>>(
          "/api/v2/knowledge/journeys",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": crypto.randomUUID(),
            },
            body: JSON.stringify(input),
          }
        )
      ).data;
    },
  });
}

export function useCustomerKnowledgeJourney(journeyId: string | undefined) {
  return useQuery<{
    journey: { id: string; status: string; customerQuestion: string | null };
    context: {
      question: string | null;
      articleTitle: string | null;
      requestType: { id: number; code: string; name: string } | null;
      service: { id: number; code: string; name: string } | null;
      conversation: CustomerKnowledgeConversationMessage[];
    };
  }>({
    queryKey: ["customer-knowledge-journey", journeyId],
    enabled: Boolean(journeyId),
    queryFn: async () =>
      (
        await fetchSupportCenter<ApiSuccess<{
          journey: { id: string; status: string; customerQuestion: string | null };
          context: {
            question: string | null;
            articleTitle: string | null;
            requestType: { id: number; code: string; name: string } | null;
            service: { id: number; code: string; name: string } | null;
            conversation: CustomerKnowledgeConversationMessage[];
          };
        }>>(`/api/v2/knowledge/journeys/${encodeURIComponent(journeyId!)}`)
      ).data,
  });
}

export function useConfirmKnowledgeResolution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (journeyId: string) =>
      (
        await fetchSupportCenter<ApiSuccess<{ journey: { id: string; status: string } }>>(
          `/api/v2/knowledge/journeys/${encodeURIComponent(journeyId)}/confirm-resolution`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": crypto.randomUUID(),
            },
            body: "{}",
          }
        )
      ).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["customer-knowledge-articles"],
      });
    },
  });
}
