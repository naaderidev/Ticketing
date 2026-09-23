import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useWorkspaceCommand, useWorkspacePredefinedMessages, useWorkspaceTickets, WorkspaceApiError } from "@/hooks/workspace-tickets-v2";

const mockFetch = jest.mocked(global.fetch);
function wrapper() { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return function Provider({ children }: Readonly<{ children: React.ReactNode }>) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }; }
function response(body: unknown, status = 200) { return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body } as Response; }

describe("workspace v2 hooks", () => {
  it("does not request predefined messages when the composer is unavailable", () => {
    const { result } = renderHook(() => useWorkspacePredefinedMessages(false), { wrapper: wrapper() });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("loads predefined messages from the authorized workspace endpoint", async () => {
    mockFetch.mockResolvedValueOnce(response({ data: [{ id: 1, title: "آماده", content: "متن", shortCode: "ready", category: "عمومی" }] }));
    const { result } = renderHook(() => useWorkspacePredefinedMessages(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v2/workspace/predefined-messages",
      { cache: "no-store" }
    );
    expect(result.current.data?.[0].title).toBe("آماده");
  });

  it("serializes scoped queue filters", async () => {
    mockFetch.mockResolvedValueOnce(response({ data: [], page: { limit: 20, hasMore: false, nextCursor: null } }));
    const { result } = renderHook(() => useWorkspaceTickets({ queueId: 7, ownership: "UNASSIGNED", limit: 20 }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("queueId=7"), { cache: "no-store" });
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("ownership=UNASSIGNED"), { cache: "no-store" });
  });

  it("sends optimistic concurrency and idempotency headers", async () => {
    mockFetch.mockResolvedValueOnce(response({ data: { ticketId: "TK-R8-TEST", version: 5 } }));
    const { result } = renderHook(() => useWorkspaceCommand(), { wrapper: wrapper() });
    await act(async () => { await result.current.mutateAsync({ ticketId: "TK-R8-TEST", version: 4, path: "internal-notes", body: { message: "داخلی", attachments: [] }, idempotencyKey: "r8-note-key" }); });
    expect(mockFetch).toHaveBeenCalledWith("/api/v2/workspace/tickets/TK-R8-TEST/internal-notes", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "Idempotency-Key": "r8-note-key", "If-Match": "W/\"ticket-TK-R8-TEST-v4\"" }) }));
  });

  it("retains stable error codes and request ids", async () => {
    mockFetch.mockResolvedValueOnce(response({ error: { code: "CONCURRENT_MODIFICATION", message: "نسخه تغییر کرده", requestId: "r8-request" } }, 409));
    const { result } = renderHook(() => useWorkspaceCommand(), { wrapper: wrapper() });
    let error: unknown;
    await act(async () => { try { await result.current.mutateAsync({ ticketId: "TK-R8-TEST", version: 4, path: "resolve", body: { resolutionSummary: "حل شد" }, idempotencyKey: "r8-resolve-key" }); } catch (caught) { error = caught; } });
    expect(error).toBeInstanceOf(WorkspaceApiError);
    expect(error).toEqual(expect.objectContaining({ code: "CONCURRENT_MODIFICATION", requestId: "r8-request" }));
  });
});
