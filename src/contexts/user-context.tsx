"use client";

import { createContext, useContext, useEffect, useCallback, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { UserData } from "@/types/shared";

interface UserContextType {
  user: UserData | null;
  setUser: (user: UserData | null) => void;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const SESSION_OPTIONAL_PATHS = new Set([
  "/",
  "/forbidden",
  "/unauthorized",
  "/user/login",
  "/user/signup",
]);
const CURRENT_USER_QUERY_KEY = ["current-user"] as const;
const SESSION_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function requestCurrentUser(): Promise<UserData | null> {
  const response = await fetch("/api/users/me", { cache: "no-store" });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`Current user request failed with status ${response.status}`);
  }
  return response.json() as Promise<UserData>;
}

export function UserProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const shouldLoadSession = !SESSION_OPTIONAL_PATHS.has(pathname);
  const { data: user = null, isLoading } = useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: requestCurrentUser,
    enabled: shouldLoadSession,
    retry: false,
  });

  useEffect(() => {
    if (!shouldLoadSession) return;

    async function refreshToken() {
      try {
        await fetch("/api/users/refresh", { method: "POST" });
      } catch {
        // A later authenticated request will revalidate the session.
      }
    }

    const refreshInterval = setInterval(
      () => void refreshToken(),
      SESSION_REFRESH_INTERVAL_MS,
    );
    return () => clearInterval(refreshInterval);
  }, [shouldLoadSession]);

  const setUser = useCallback((newUser: UserData | null) => {
    queryClient.setQueryData(CURRENT_USER_QUERY_KEY, newUser);
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/users/logout", { method: "POST" });
    } finally {
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
      window.location.replace("/");
    }
  }, [queryClient]);

  return (
    <UserContext.Provider value={{ user, setUser, isLoading, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
