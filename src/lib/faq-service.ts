import { prisma } from "@/lib/prisma";
import { errors } from "@/lib/strings";

interface FaqFilters {
  departmentId?: string;
  subDepartmentId?: string;
}

export async function getFaqs(filters: FaqFilters = {}) {
  const where: Record<string, unknown> = {};

  if (filters.departmentId) {
    where.departmentId = parseInt(filters.departmentId);
  }

  if (filters.subDepartmentId) {
    where.subDepartmentId = parseInt(filters.subDepartmentId);
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
    throw new Error(errors.FAQ_REQUIRED_FIELDS);
  }

  const deptId = parseInt(departmentId);

  const department = await prisma.department.findUnique({ where: { id: deptId } });
  if (!department) {
    throw new Error(errors.DEPARTMENT_NOT_FOUND);
  }

  if (subDepartmentId) {
    const subDept = await prisma.subDepartment.findUnique({
      where: { id: parseInt(subDepartmentId) },
    });
    if (!subDept) {
      throw new Error(errors.SUB_DEPARTMENT_NOT_FOUND);
    }
  }

  const whereClause: Record<string, unknown> = { departmentId: deptId };
  if (subDepartmentId) {
    whereClause.subDepartmentId = parseInt(subDepartmentId);
  }

  const aggregate = await prisma.fAQ.aggregate({
    where: whereClause,
    _max: { priority: true },
  });

  const finalPriority = priority ?? (aggregate._max.priority ?? 0) + 1;

  return prisma.fAQ.create({
    data: {
      question,
      answer,
      departmentId: deptId,
      subDepartmentId: subDepartmentId ? parseInt(subDepartmentId) : null,
      priority: finalPriority,
    },
    include: {
      department: { select: { name: true } },
      subDepartment: { select: { name: true } },
    },
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
    throw new Error(errors.FAQ_NOT_FOUND);
  }

  const updateData: Record<string, unknown> = {};
  if (data.question) updateData.question = data.question;
  if (data.answer) updateData.answer = data.answer;
  if (data.priority !== undefined) updateData.priority = data.priority;

  return prisma.fAQ.update({
    where: { id },
    data: updateData,
    include: {
      department: { select: { name: true } },
      subDepartment: { select: { name: true } },
    },
  });
}

export async function deleteFaq(id: number) {
  await prisma.fAQ.delete({ where: { id } });
}

export async function reorderFaqs(
  items: Array<{ id: number; priority: number }>
) {
  if (!items || !Array.isArray(items)) {
    throw new Error(errors.ITEMS_REQUIRED);
  }

  const updates = items.map((item) =>
    prisma.fAQ.update({
      where: { id: item.id },
      data: { priority: item.priority },
    })
  );

  await prisma.$transaction(updates);
}
