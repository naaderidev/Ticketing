"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Department, SubDepartment } from "@/types/ticket";
import { DepartmentWithCount, SubDepartmentWithCount } from "@/types/shared";

export function useDepartments() {
  return useQuery<DepartmentWithCount[]>({
    queryKey: ["departments"],
    queryFn: async () => {
      const res = await fetch("/api/departments");
      if (!res.ok) throw new Error("Failed to fetch departments");
      return res.json();
    },
  });
}

export function useDepartment(id: number) {
  return useQuery<DepartmentWithCount & { subDepartments: SubDepartmentWithCount[] }>({
    queryKey: ["department", id],
    queryFn: async () => {
      const res = await fetch(`/api/departments/${id}`);
      if (!res.ok) throw new Error("Failed to fetch department");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create department");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
  });
}

export function useUpdateDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await fetch(`/api/departments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update department");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
  });
}

export function useDeleteDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/departments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete department");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
  });
}

export function useSubDepartments(departmentId: number) {
  return useQuery<SubDepartmentWithCount[]>({
    queryKey: ["subDepartments", departmentId],
    queryFn: async () => {
      const res = await fetch(`/api/departments/${departmentId}/subdepartments`);
      if (!res.ok) throw new Error("Failed to fetch sub-departments");
      return res.json();
    },
    enabled: !!departmentId,
  });
}

export function useAllSubDepartments() {
  return useQuery<SubDepartmentWithCount[]>({
    queryKey: ["allSubDepartments"],
    queryFn: async () => {
      const res = await fetch("/api/subdepartments");
      if (!res.ok) throw new Error("Failed to fetch sub-departments");
      return res.json();
    },
  });
}

export function useCreateSubDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ departmentId, name }: { departmentId: number; name: string }) => {
      const res = await fetch(`/api/departments/${departmentId}/subdepartments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create sub-department");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["subDepartments", variables.departmentId] });
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
  });
}

export function useUpdateSubDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await fetch(`/api/subdepartments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update sub-department");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subDepartments"] });
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
  });
}

export function useDeleteSubDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, departmentId }: { id: number; departmentId: number }) => {
      const res = await fetch(`/api/subdepartments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete sub-department");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["subDepartments", variables.departmentId] });
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
  });
}
