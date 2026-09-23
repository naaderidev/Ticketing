"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BusinessReferenceOption,
  CreateCustomerTicketCommand,
  CursorPage,
  CustomerCatalogService,
  CustomerTicket,
  CustomerTicketListItem,
  CustomerTicketStatus,
} from "@/types/customer-ticket-v2";

type ApiV2Success<T> = { data: T };
type ApiV2ListSuccess<T> = { data: T[]; page: CursorPage };
type ApiV2Failure = {
  error?: { code?: string; message?: string; requestId?: string };
};

export class CustomerApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId: string | null
  ) {
    super(message);
    this.name = "CustomerApiError";
  }
}

async function readFailure(response: Response): Promise<CustomerApiError> {
  try {
    const body = (await response.json()) as ApiV2Failure;
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

async function fetchApiV2<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) throw await readFailure(response);
  return (await response.json()) as T;
}

function commandHeaders(
  ticketId: string,
  version: number,
  idempotencyKey: string
): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
    "If-Match": `W/"ticket-${ticketId}-v${version}"`,
  };
}

function useTicketResultMutation<TInput extends { ticketId: string }>(
  activePartyId: number | undefined,
  mutationFn: (input: TInput) => Promise<CustomerTicket>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (ticket) => {
      if (activePartyId !== undefined) {
        queryClient.setQueryData(
          ["customer-ticket-v2", activePartyId, ticket.ticketId],
          ticket
        );
      }
      await queryClient.invalidateQueries({
        queryKey: ["customer-tickets-v2"],
      });
    },
    onError: async (error, input) => {
      if (
        error instanceof CustomerApiError &&
        ["CONCURRENT_MODIFICATION", "INVALID_TRANSITION"].includes(error.code)
      ) {
        await queryClient.invalidateQueries({
          queryKey: ["customer-ticket-v2", activePartyId, input.ticketId],
        });
      }
    },
  });
}

export function useCustomerSupportCatalogV2() {
  return useQuery<CustomerCatalogService[]>({
    queryKey: ["customer-support-catalog-v2"],
    queryFn: async () =>
      (await fetchApiV2<ApiV2Success<CustomerCatalogService[]>>(
        "/api/v2/support/catalog"
      )).data,
  });
}

export function useCustomerTicketsV2(input: {
  status?: CustomerTicketStatus;
  cursor?: string | null;
  limit?: number;
}, activePartyId: number | undefined) {
  const params = new URLSearchParams();
  if (input.status) params.set("status", input.status);
  if (input.cursor) params.set("cursor", input.cursor);
  params.set("limit", String(input.limit ?? 25));
  return useQuery<ApiV2ListSuccess<CustomerTicketListItem>>({
    queryKey: ["customer-tickets-v2", activePartyId, input],
    enabled: activePartyId !== undefined,
    queryFn: () =>
      fetchApiV2(`/api/v2/tickets?${params.toString()}`),
  });
}

export function useCustomerTicketV2(
  ticketId: string,
  activePartyId: number | undefined
) {
  return useQuery<CustomerTicket>({
    queryKey: ["customer-ticket-v2", activePartyId, ticketId],
    enabled: Boolean(ticketId) && activePartyId !== undefined,
    queryFn: async () =>
      (await fetchApiV2<ApiV2Success<CustomerTicket>>(
        `/api/v2/tickets/${encodeURIComponent(ticketId)}`
      )).data,
  });
}

export function useBusinessReferenceSearch(input: {
  activePartyId: number | undefined;
  subjectType: string | null;
  query: string;
  enabled: boolean;
}) {
  const normalizedQuery = input.query.trim();
  return useQuery<BusinessReferenceOption[]>({
    queryKey: [
      "business-reference-search",
      input.activePartyId,
      input.subjectType,
      normalizedQuery,
    ],
    enabled:
      input.enabled &&
      input.activePartyId !== undefined &&
      Boolean(input.subjectType) &&
      normalizedQuery.length >= 2,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () =>
      (
        await fetchApiV2<ApiV2ListSuccess<BusinessReferenceOption>>(
          `/api/v2/business-subjects/${encodeURIComponent(input.subjectType ?? "")}?q=${encodeURIComponent(normalizedQuery)}&limit=10`
        )
      ).data,
  });
}

export function useCreateCustomerTicketV2() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      command: CreateCustomerTicketCommand;
      idempotencyKey: string;
    }) =>
      (
        await fetchApiV2<ApiV2Success<CustomerTicket>>("/api/v2/tickets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": input.idempotencyKey,
          },
          body: JSON.stringify(input.command),
        })
      ).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["customer-tickets-v2"],
      });
    },
  });
}

export function useAddCustomerMessageV2(activePartyId: number | undefined) {
  return useTicketResultMutation(
    activePartyId,
    async (input: {
      ticketId: string;
      version: number;
      message: string;
      attachments: Array<{ uploadId: string }>;
      idempotencyKey: string;
    }) =>
      (
        await fetchApiV2<ApiV2Success<CustomerTicket>>(
          `/api/v2/tickets/${encodeURIComponent(input.ticketId)}/messages`,
          {
            method: "POST",
            headers: commandHeaders(
              input.ticketId,
              input.version,
              input.idempotencyKey
            ),
            body: JSON.stringify({
              message: input.message,
              attachments: input.attachments,
            }),
          }
        )
      ).data
  );
}

export function useTransitionCustomerTicketV2(activePartyId: number | undefined) {
  return useTicketResultMutation(
    activePartyId,
    async (input: {
      ticketId: string;
      version: number;
      transition: "confirm-resolution" | "reject-resolution" | "reopen";
      reason?: string;
      idempotencyKey: string;
    }) =>
      (
        await fetchApiV2<ApiV2Success<CustomerTicket>>(
          `/api/v2/tickets/${encodeURIComponent(input.ticketId)}/${input.transition}`,
          {
            method: "POST",
            headers: commandHeaders(
              input.ticketId,
              input.version,
              input.idempotencyKey
            ),
            body: JSON.stringify(input.reason ? { reason: input.reason } : {}),
          }
        )
      ).data
  );
}

export function useRateCustomerTicketV2(activePartyId: number | undefined) {
  return useTicketResultMutation(
    activePartyId,
    async (input: {
      ticketId: string;
      version: number;
      rating: number;
      idempotencyKey: string;
    }) =>
      (
        await fetchApiV2<ApiV2Success<CustomerTicket>>(
          `/api/v2/tickets/${encodeURIComponent(input.ticketId)}/rating`,
          {
            method: "POST",
            headers: commandHeaders(
              input.ticketId,
              input.version,
              input.idempotencyKey
            ),
            body: JSON.stringify({ rating: input.rating }),
          }
        )
      ).data
  );
}
