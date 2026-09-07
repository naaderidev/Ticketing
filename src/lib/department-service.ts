import { prisma } from "@/lib/prisma";
import { errors } from "@/lib/strings";

export async function getDepartments() {
  return prisma.department.findMany({
    include: {
      subDepartments: true,
      _count: { select: { tickets: true, subDepartments: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getDepartmentById(id: number) {
  return prisma.department.findUnique({
    where: { id },
    include: {
      subDepartments: true,
      faqs: true,
      _count: { select: { tickets: true } },
    },
  });
}

export async function createDepartment(name: string) {
  if (!name || !name.trim()) {
    throw new Error(errors.DEPARTMENT_NAME_REQUIRED);
  }

  const existing = await prisma.department.findFirst({
    where: { name: name.trim() },
  });

  if (existing) {
    throw new Error(errors.DEPARTMENT_ALREADY_EXISTS);
  }

  return prisma.department.create({
    data: { name: name.trim() },
  });
}

export async function updateDepartment(id: number, name: string) {
  if (!name || !name.trim()) {
    throw new Error(errors.DEPARTMENT_NAME_REQUIRED);
  }

  const existing = await prisma.department.findFirst({
    where: { name: name.trim(), id: { not: id } },
  });

  if (existing) {
    throw new Error(errors.DEPARTMENT_ALREADY_EXISTS);
  }

  return prisma.department.update({
    where: { id },
    data: { name: name.trim() },
  });
}

export async function deleteDepartment(id: number) {
  const hasTickets = await prisma.ticket.findFirst({
    where: { departmentId: id },
  });

  if (hasTickets) {
    throw new Error(errors.DEPARTMENT_HAS_TICKETS);
  }

  await prisma.department.delete({ where: { id } });
}

export async function getSubDepartments(departmentId: number) {
  return prisma.subDepartment.findMany({
    where: { departmentId },
    include: { _count: { select: { tickets: true, faqs: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getAllSubDepartments() {
  return prisma.subDepartment.findMany({
    include: { department: true, _count: { select: { tickets: true, faqs: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getSubDepartmentById(id: number) {
  return prisma.subDepartment.findUnique({
    where: { id },
    include: {
      department: true,
      faqs: true,
      _count: { select: { tickets: true } },
    },
  });
}

export async function createSubDepartment(departmentId: number, name: string) {
  if (!name || !name.trim()) {
    throw new Error(errors.SUB_DEPARTMENT_NAME_REQUIRED);
  }

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
  });

  if (!department) {
    throw new Error(errors.DEPARTMENT_NOT_FOUND);
  }

  const existing = await prisma.subDepartment.findFirst({
    where: { name: name.trim(), departmentId },
  });

  if (existing) {
    throw new Error(errors.SUB_DEPARTMENT_ALREADY_EXISTS);
  }

  return prisma.subDepartment.create({
    data: { name: name.trim(), departmentId },
  });
}

export async function updateSubDepartment(id: number, name: string) {
  if (!name || !name.trim()) {
    throw new Error(errors.SUB_DEPARTMENT_NAME_REQUIRED);
  }

  const subDepartment = await prisma.subDepartment.findUnique({ where: { id } });
  if (!subDepartment) {
    throw new Error(errors.SUB_DEPARTMENT_NOT_FOUND);
  }

  const existing = await prisma.subDepartment.findFirst({
    where: {
      name: name.trim(),
      departmentId: subDepartment.departmentId,
      id: { not: id },
    },
  });

  if (existing) {
    throw new Error(errors.SUB_DEPARTMENT_ALREADY_EXISTS);
  }

  return prisma.subDepartment.update({
    where: { id },
    data: { name: name.trim() },
  });
}

export async function deleteSubDepartment(id: number) {
  const hasTickets = await prisma.ticket.findFirst({
    where: { subDepartmentId: id },
  });

  if (hasTickets) {
    throw new Error(errors.SUB_DEPARTMENT_HAS_TICKETS);
  }

  await prisma.subDepartment.delete({ where: { id } });
}
