"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FAQItem } from "@/types/shared";

export function useFaqs(filters?: { departmentId?: string; subDepartmentId?: string }) {
  const params = new URLSearchParams();
  if (filters?.departmentId) params.set("departmentId", filters.departmentId);
  if (filters?.subDepartmentId) params.set("subDepartmentId", filters.subDepartmentId);

  return useQuery<FAQItem[]>({
    queryKey: ["faqs", filters],
    queryFn: async () => {
      const res = await fetch(`/api/faq?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch FAQs");
      return res.json();
    },
  });
}

export function useCreateFaq() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { question: string; answer: string; departmentId: string; subDepartmentId?: string }) => {
      const res = await fetch("/api/faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create FAQ");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faqs"] });
    },
  });
}

interface FaqUpdateData {
  question?: string;
  answer?: string;
  priority?: number;
  departmentId?: number;
  subDepartmentId?: number | null;
}

export function useUpdateFaq() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: FaqUpdateData }) => {
      const res = await fetch(`/api/faq/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update FAQ");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faqs"] });
    },
  });
}

export function useDeleteFaq() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/faq/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete FAQ");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faqs"] });
    },
  });
}

export function useReorderFaqs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: Array<{ id: number; priority: number }>) => {
      const res = await fetch("/api/faq/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error("Failed to reorder FAQs");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faqs"] });
    },
  });
}
