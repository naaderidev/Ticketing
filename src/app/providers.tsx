"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DirectionProvider } from "@radix-ui/react-direction";
import { useState, useEffect } from "react";
import { UserProvider } from "@/contexts/user-context";

function useSuppressReact19Error() {
  useEffect(() => {
    const handler = (e: ErrorEvent) => {
      if (e.message?.includes("startTime")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return false;
      }
    };
    window.addEventListener("error", handler, true);
    return () => window.removeEventListener("error", handler, true);
  }, []);
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  useSuppressReact19Error();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <DirectionProvider dir="rtl">
      <QueryClientProvider client={queryClient}>
        <UserProvider>{children}</UserProvider>
      </QueryClientProvider>
    </DirectionProvider>
  );
}
