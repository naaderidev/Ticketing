import { prisma } from "@/lib/prisma";
import { errors } from "@/lib/strings";
import {
  conflictError,
  notFoundError,
  rethrowPersistenceError,
  validationError,
} from "@/lib/domain-error";

export async function getDepartments() {
  return prisma.department.findMany({
    where: { internalOnly: false },
    include: {
      subDepartments: { where: { internalOnly: false } },
      _count: { select: { tickets: true, subDepartments: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getDepartmentById(id: number) {
  return prisma.department.findFirst({
    where: { id, internalOnly: false },
    include: {
      subDepartments: { where: { internalOnly: false } },
      faqs: true,
      _count: { select: { tickets: true } },
    },
  });
}

export async function createDepartment(name: string) {
  if (!name || !name.trim()) {
    throw validationError(errors.DEPARTMENT_NAME_REQUIRED);
  }

  const existing = await prisma.department.findFirst({
    where: { name: name.trim() },
  });

  if (existing) {
    throw conflictError(errors.DEPARTMENT_ALREADY_EXISTS);
  }

  try {
    return await prisma.department.create({ data: { name: name.trim() } });
  } catch (error) {
    rethrowPersistenceError(error, { unique: errors.DEPARTMENT_ALREADY_EXISTS });
  }
}

export async function updateDepartment(id: number, name: string) {
  if (!name || !name.trim()) {
    throw validationError(errors.DEPARTMENT_NAME_REQUIRED);
  }

  const existing = await prisma.department.findFirst({
    where: { name: name.trim(), id: { not: id } },
  });

  if (existing) {
    throw conflictError(errors.DEPARTMENT_ALREADY_EXISTS);
  }

  const editable = await prisma.department.findFirst({
    where: { id, internalOnly: false },
    select: { id: true },
  });
  if (!editable) throw notFoundError(errors.DEPARTMENT_NOT_FOUND);

  try {
    return await prisma.department.update({
      where: { id },
      data: { name: name.trim() },
    });
  } catch (error) {
    rethrowPersistenceError(error, {
      unique: errors.DEPARTMENT_ALREADY_EXISTS,
      notFound: errors.DEPARTMENT_NOT_FOUND,
    });
  }
}

export async function deleteDepartment(id: number) {
  const editable = await prisma.department.findFirst({
    where: { id, internalOnly: false },
    select: { id: true },
  });
  if (!editable) throw notFoundError(errors.DEPARTMENT_NOT_FOUND);

  const hasTickets = await prisma.ticket.findFirst({
    where: { departmentId: id },
  });

  if (hasTickets) {
    throw conflictError(errors.DEPARTMENT_HAS_TICKETS);
  }

  try {
    await prisma.department.delete({ where: { id } });
  } catch (error) {
    rethrowPersistenceError(error, {
      notFound: errors.DEPARTMENT_NOT_FOUND,
      foreignKey: errors.DEPARTMENT_HAS_TICKETS,
    });
  }
}

export async function getSubDepartments(departmentId: number) {
  return prisma.subDepartment.findMany({
    where: { departmentId, internalOnly: false, department: { internalOnly: false } },
    include: { _count: { select: { tickets: true, faqs: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getAllSubDepartments() {
  return prisma.subDepartment.findMany({
    where: { internalOnly: false, department: { internalOnly: false } },
    include: { department: true, _count: { select: { tickets: true, faqs: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getSubDepartmentById(id: number) {
  return prisma.subDepartment.findFirst({
    where: { id, internalOnly: false, department: { internalOnly: false } },
    include: {
      department: true,
      faqs: true,
      _count: { select: { tickets: true } },
    },
  });
}

export async function createSubDepartment(departmentId: number, name: string) {
  if (!name || !name.trim()) {
    throw validationError(errors.SUB_DEPARTMENT_NAME_REQUIRED);
  }

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
  });

  if (!department || department.internalOnly) {
    throw notFoundError(errors.DEPARTMENT_NOT_FOUND);
  }

  const existing = await prisma.subDepartment.findFirst({
    where: { name: name.trim(), departmentId },
  });

  if (existing) {
    throw conflictError(errors.SUB_DEPARTMENT_ALREADY_EXISTS);
  }

  try {
    return await prisma.subDepartment.create({
      data: { name: name.trim(), departmentId },
    });
  } catch (error) {
    rethrowPersistenceError(error, {
      unique: errors.SUB_DEPARTMENT_ALREADY_EXISTS,
      foreignKeyNotFound: errors.DEPARTMENT_NOT_FOUND,
    });
  }
}

export async function updateSubDepartment(id: number, name: string) {
  if (!name || !name.trim()) {
    throw validationError(errors.SUB_DEPARTMENT_NAME_REQUIRED);
  }

  const subDepartment = await prisma.subDepartment.findFirst({
    where: { id, internalOnly: false, department: { internalOnly: false } },
  });
  if (!subDepartment) {
    throw notFoundError(errors.SUB_DEPARTMENT_NOT_FOUND);
  }

  const existing = await prisma.subDepartment.findFirst({
    where: {
      name: name.trim(),
      departmentId: subDepartment.departmentId,
      id: { not: id },
    },
  });

  if (existing) {
    throw conflictError(errors.SUB_DEPARTMENT_ALREADY_EXISTS);
  }

  try {
    return await prisma.subDepartment.update({
      where: { id },
      data: { name: name.trim() },
    });
  } catch (error) {
    rethrowPersistenceError(error, {
      unique: errors.SUB_DEPARTMENT_ALREADY_EXISTS,
      notFound: errors.SUB_DEPARTMENT_NOT_FOUND,
    });
  }
}

export async function deleteSubDepartment(id: number) {
  const editable = await prisma.subDepartment.findFirst({
    where: { id, internalOnly: false, department: { internalOnly: false } },
    select: { id: true },
  });
  if (!editable) throw notFoundError(errors.SUB_DEPARTMENT_NOT_FOUND);

  const hasTickets = await prisma.ticket.findFirst({
    where: { subDepartmentId: id },
  });

  if (hasTickets) {
    throw conflictError(errors.SUB_DEPARTMENT_HAS_TICKETS);
  }

  try {
    await prisma.subDepartment.delete({ where: { id } });
  } catch (error) {
    rethrowPersistenceError(error, {
      notFound: errors.SUB_DEPARTMENT_NOT_FOUND,
      foreignKey: errors.SUB_DEPARTMENT_HAS_TICKETS,
    });
  }
}
