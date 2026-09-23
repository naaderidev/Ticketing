import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRecurringProblemDrillDown } from "@/hooks/reporting-dashboard";

const mockFetch = jest.mocked(global.fetch);

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Provider({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("reporting dashboard hooks", () => {
  it("keeps the selected report range in recurring-problem drill-down requests", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ data: { tickets: [] } }),
    } as Response);

    const signalKey = "a".repeat(64);
    const { result } = renderHook(
      () => useRecurringProblemDrillDown(signalKey, {
        from: "1405/06/02",
        to: "1405/06/31",
      }),
      { wrapper: wrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const requestedPath = mockFetch.mock.calls[0]?.[0];
    expect(requestedPath).toEqual(expect.stringContaining(`/${signalKey}/tickets?`));
    expect(requestedPath).toEqual(expect.stringContaining("from=1405%2F06%2F02+00%3A00%3A00"));
    expect(requestedPath).toEqual(expect.stringContaining("to=1405%2F07%2F01+00%3A00%3A00"));
  });
});
