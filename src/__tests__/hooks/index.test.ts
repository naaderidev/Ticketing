import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useTickets,
  useTicket,
  useDepartments,
  useUsers,
  useNotifications,
} from "@/hooks";

// Create a test wrapper for React Query
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("Hooks", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe("useTickets", () => {
    it("should fetch tickets successfully", async () => {
      const mockTickets = {
        tickets: [
          {
            id: 1,
            ticketId: "TK-TEST-123",
            subject: "Test Ticket",
            status: "OPEN",
            userName: "Test User",
            rating: null,
            createdAt: "2024-01-15T10:30:00.000Z",
            department: { name: "Department 1" },
            subDepartment: { name: "Sub Department 1" },
            _count: { replies: 2 },
          },
        ],
        pagination: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTickets,
      });

      const { result } = renderHook(() => useTickets({ page: 1, limit: 10 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockTickets);
    });

    it("should handle fetch error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Failed to fetch tickets" }),
      });

      const { result } = renderHook(() => useTickets({ page: 1, limit: 10 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });

  describe("useTicket", () => {
    it("should fetch single ticket successfully", async () => {
      const mockTicket = {
        id: 1,
        ticketId: "TK-TEST-123",
        subject: "Test Ticket",
        message: "Test Message",
        status: "OPEN",
        userName: "Test User",
        rating: null,
        createdAt: "2024-01-15T10:30:00.000Z",
        department: { name: "Department 1" },
        subDepartment: { name: "Sub Department 1" },
        replies: [],
        attachments: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTicket,
      });

      const { result } = renderHook(() => useTicket("TK-TEST-123"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockTicket);
    });

    it("should not fetch when ticketId is empty", () => {
      const { result } = renderHook(() => useTicket(""), {
        wrapper: createWrapper(),
      });

      expect(result.current.isFetching).toBe(false);
    });
  });

  describe("useDepartments", () => {
    it("should fetch departments successfully", async () => {
      const mockDepartments = [
        { id: 1, name: "Department 1" },
        { id: 2, name: "Department 2" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDepartments,
      });

      const { result } = renderHook(() => useDepartments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockDepartments);
    });
  });

  describe("useUsers", () => {
    it("should fetch users successfully", async () => {
      const mockUsers = [
        {
          id: 1,
          firstName: "Ali",
          lastName: "Ahmadi",
          nationalCode: "1234567890",
          mobile: "09121234567",
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockUsers,
      });

      const { result } = renderHook(() => useUsers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockUsers);
    });
  });

  describe("useNotifications", () => {
    it("should fetch notifications successfully", async () => {
      const mockNotifications = {
        notifications: [
          {
            id: 1,
            message: "Test Notification",
            read: false,
            ticketId: 1,
            recipientType: "ADMIN",
            userId: null,
            createdAt: "2024-01-15T10:30:00.000Z",
          },
        ],
        unreadCount: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockNotifications,
      });

      const { result } = renderHook(() => useNotifications(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockNotifications);
    });
  });
});
