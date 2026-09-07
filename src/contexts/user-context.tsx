"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { UserData } from "@/types/shared";

interface UserContextType {
  user: UserData | null;
  setUser: (user: UserData | null) => void;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchUser();
    const refreshInterval = setInterval(refreshToken, 6 * 60 * 60 * 1000); // Every 6 hours
    return () => clearInterval(refreshInterval);
  }, []);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/users/me");
      if (res.ok) {
        const userData = await res.json();
        setUserState(userData);
      } else {
        setUserState(null);
      }
    } catch {
      setUserState(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshToken = async () => {
    try {
      await fetch("/api/users/refresh", { method: "POST" });
    } catch {
      // Silent fail - will retry on next interval
    }
  };

  const setUser = useCallback((newUser: UserData | null) => {
    setUserState(newUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/users/logout", { method: "POST" });
    } finally {
      setUserState(null);
      window.location.href = "/user/login";
    }
  }, []);

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
