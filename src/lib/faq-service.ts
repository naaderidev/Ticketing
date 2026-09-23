import { prisma } from "@/lib/prisma";
import { errors } from "@/lib/strings";
import { runSerializableTransaction } from "@/lib/database-transaction";
import {
  notFoundError,
  rethrowPersistenceError,
  validationError,
} from "@/lib/domain-error";

interface FaqFilters {
  departmentId?: string;
  subDepartmentId?: string;
}

export async function getFaqs(filters: FaqFilters = {}) {
  const where: Record<string, unknown> = {};

  if (filters.departmentId && filters.departmentId !== "all") {
    where.departmentId = parseInt(filters.departmentId);
  }

  if (filters.subDepartmentId && filters.subDepartmentId !== "all" && filters.subDepartmentId !== "none") {
    where.subDepartmentId = parseInt(filters.subDepartmentId);
  } else if (filters.subDepartmentId === "none") {
    where.subDepartmentId = null;
  }

  return prisma.fAQ.findMany({
    where,
    include: {
      department: { select: { name: true } },
      subDepartment: { select: { name: true } },
    },
    orderBy: { priority: "asc" },
  });
}

export async function getFaqById(id: number) {
  return prisma.fAQ.findUnique({
    where: { id },
    include: { department: true, subDepartment: true },
  });
}

interface CreateFaqData {
  question: string;
  answer: string;
  departmentId: string;
  subDepartmentId?: string;
  priority?: number;
}

export async function createFaq(data: CreateFaqData) {
  const { question, answer, departmentId, subDepartmentId, priority } = data;

  if (!question || !answer || !departmentId) {
    throw validationError(errors.FAQ_REQUIRED_FIELDS);
  }

  const deptId = parseInt(departmentId);
  const subDeptId = subDepartmentId ? parseInt(subDepartmentId) : null;

  return runSerializableTransaction(async (transaction) => {
    const department = await transaction.department.findUnique({
      where: { id: deptId },
      select: { id: true },
    });
    if (!department) throw notFoundError(errors.DEPARTMENT_NOT_FOUND);

    if (subDeptId) {
      const subDepartment = await transaction.subDepartment.findUnique({
        where: { id: subDeptId },
        select: { id: true, departmentId: true },
      });
      if (!subDepartment) throw notFoundError(errors.SUB_DEPARTMENT_NOT_FOUND);
      if (subDepartment.departmentId !== department.id) {
        throw validationError(errors.SUB_DEPARTMENT_DEPARTMENT_MISMATCH);
      }
    }

    const aggregate = await transaction.fAQ.aggregate({
      where: { departmentId: deptId, subDepartmentId: subDeptId },
      _max: { priority: true },
    });
    const finalPriority = priority ?? (aggregate._max.priority ?? 0) + 1;

    return transaction.fAQ.create({
      data: {
        question,
        answer,
        departmentId: deptId,
        subDepartmentId: subDeptId,
        priority: finalPriority,
      },
      include: {
        department: { select: { name: true } },
        subDepartment: { select: { name: true } },
      },
    });
  });
}

interface UpdateFaqData {
  question?: string;
  answer?: string;
  priority?: number;
}

export async function updateFaq(id: number, data: UpdateFaqData) {
  const faq = await prisma.fAQ.findUnique({ where: { id } });
  if (!faq) {
    throw notFoundError(errors.FAQ_NOT_FOUND);
  }

  const updateData: Record<string, unknown> = {};
  if (data.question) updateData.question = data.question;
  if (data.answer) updateData.answer = data.answer;
  if (data.priority !== undefined) updateData.priority = data.priority;

  try {
    return await prisma.fAQ.update({
      where: { id },
      data: updateData,
      include: {
        department: { select: { name: true } },
        subDepartment: { select: { name: true } },
      },
    });
  } catch (error) {
    rethrowPersistenceError(error, { notFound: errors.FAQ_NOT_FOUND });
  }
}

export async function deleteFaq(id: number) {
  try {
    await prisma.fAQ.delete({ where: { id } });
  } catch (error) {
    rethrowPersistenceError(error, { notFound: errors.FAQ_NOT_FOUND });
  }
}

export async function reorderFaqs(
  items: Array<{ id: number; priority: number }>
) {
  if (!items || !Array.isArray(items)) {
    throw validationError(errors.ITEMS_REQUIRED);
  }
  const uniqueIds = new Set(items.map((item) => item.id));
  const uniquePriorities = new Set(items.map((item) => item.priority));
  if (uniqueIds.size !== items.length || uniquePriorities.size !== items.length) {
    throw validationError("شناسه و اولویت آیتم‌ها باید یکتا باشند");
  }

  await runSerializableTransaction(async (transaction) => {
    const existing = await transaction.fAQ.findMany({
      where: { id: { in: [...uniqueIds] } },
      select: { id: true },
    });
    if (existing.length !== uniqueIds.size) throw notFoundError(errors.FAQ_NOT_FOUND);

    for (const item of items) {
      await transaction.fAQ.update({
        where: { id: item.id },
        data: { priority: item.priority },
      });
    }
  });
}
