import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  CustomerApiError,
  useCreateCustomerTicketV2,
  useCustomerSupportCatalogV2,
  useCustomerTicketsV2,
  useTransitionCustomerTicketV2,
} from "@/hooks/customer-tickets-v2";
import {
  useCustomerKnowledgeArticles,
  useStartKnowledgeJourney,
} from "@/hooks/customer-support-center";
import type { CustomerTicket } from "@/types/customer-ticket-v2";

const mockFetch = jest.mocked(global.fetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function TestQueryProvider({ children }: Readonly<{ children: React.ReactNode }>) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as Response;
}

const ticket = {
  ticketId: "TK-R7-TEST",
  subject: "درخواست آزمایشی",
  status: "IN_PROGRESS",
  priority: "NORMAL",
  version: 4,
  rating: null,
  resolutionSummary: null,
  requestType: {
    code: "ACCOUNT_ACCESS",
    name: "دسترسی حساب",
    service: { code: "ACCOUNT", name: "حساب کاربری" },
  },
  organization: null,
  businessReferences: [],
  sla: null,
  resolutionConfirmation: null,
  messages: [],
  createdAt: "2026-09-13T00:00:00.000Z",
  updatedAt: "2026-09-13T00:00:00.000Z",
  closedAt: null,
} satisfies CustomerTicket;

describe("customer ticket v2 hooks", () => {
  it("searches customer knowledge within the active account cache", async () => {
    mockFetch.mockResolvedValueOnce(response({ data: [] }));
    const { result } = renderHook(
      () => useCustomerKnowledgeArticles({ query: "پرداخت", activePartyId: 17 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v2/knowledge/articles?q=%D9%BE%D8%B1%D8%AF%D8%A7%D8%AE%D8%AA&limit=18",
      { cache: "no-store" }
    );
  });

  it("starts a knowledge journey with an idempotency key", async () => {
    mockFetch.mockResolvedValueOnce(
      response({ data: { journey: { id: "journey-1" }, article: { id: 7 } } }, 201)
    );
    const { result } = renderHook(() => useStartKnowledgeJourney(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync(7);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v2/knowledge/journeys",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
        body: JSON.stringify({ articleId: 7 }),
      })
    );
  });

  it("keeps ticket list caches isolated by active account", async () => {
    mockFetch
      .mockResolvedValueOnce(response({ data: [], page: { nextCursor: null, hasMore: false, limit: 5 } }))
      .mockResolvedValueOnce(response({ data: [ticket], page: { nextCursor: null, hasMore: false, limit: 5 } }));
    const { result, rerender } = renderHook(
      ({ activePartyId }) => useCustomerTicketsV2({ limit: 5 }, activePartyId),
      { wrapper: createWrapper(), initialProps: { activePartyId: 17 } }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toEqual([]);

    rerender({ activePartyId: 70 });
    await waitFor(() => expect(result.current.data?.data).toEqual([ticket]));

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("reads the customer-safe support catalog", async () => {
    mockFetch.mockResolvedValueOnce(response({ data: [] }));
    const { result } = renderHook(() => useCustomerSupportCatalogV2(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith("/api/v2/support/catalog", {
      cache: "no-store",
    });
  });

  it("sends create commands with a stable caller-provided idempotency key", async () => {
    mockFetch.mockResolvedValueOnce(response({ data: ticket }, 201));
    const { result } = renderHook(() => useCreateCustomerTicketV2(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        idempotencyKey: "r7-create-key",
        command: {
          requestTypeId: 12,
          subject: "درخواست آزمایشی",
          description: "شرح درخواست آزمایشی",
          businessReferences: [],
          attachments: [],
        },
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v2/tickets",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: expect.objectContaining({
          "Idempotency-Key": "r7-create-key",
        }),
      })
    );
  });

  it("protects customer transitions with both idempotency and ticket version", async () => {
    mockFetch.mockResolvedValueOnce(response({ data: ticket }));
    const { result } = renderHook(() => useTransitionCustomerTicketV2(17), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        ticketId: ticket.ticketId,
        version: 3,
        transition: "reject-resolution",
        reason: "مسئله کامل حل نشده است",
        idempotencyKey: "r7-transition-key",
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/v2/tickets/${ticket.ticketId}/reject-resolution`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "r7-transition-key",
          "If-Match": `W/"ticket-${ticket.ticketId}-v3"`,
        }),
      })
    );
  });

  it("keeps the safe API message and request id for support diagnostics", async () => {
    mockFetch.mockResolvedValueOnce(
      response(
        {
          error: {
            code: "CONCURRENT_MODIFICATION",
            message: "تیکت هم‌زمان تغییر کرده است",
            requestId: "request-r7",
          },
        },
        409
      )
    );
    const { result } = renderHook(() => useCreateCustomerTicketV2(), {
      wrapper: createWrapper(),
    });

    let error: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({
          idempotencyKey: "r7-error-key",
          command: {
            requestTypeId: 12,
            subject: "درخواست آزمایشی",
            description: "شرح درخواست آزمایشی",
            businessReferences: [],
            attachments: [],
          },
        });
      } catch (caught) {
        error = caught;
      }
    });

    expect(error).toBeInstanceOf(CustomerApiError);
    expect(error).toEqual(
      expect.objectContaining({
        code: "CONCURRENT_MODIFICATION",
        requestId: "request-r7",
        status: 409,
      })
    );
  });
});
