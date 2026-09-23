import { prisma } from "@/lib/prisma";
import { errors } from "@/lib/strings";
import {
  conflictError,
  notFoundError,
  rethrowPersistenceError,
  validationError,
} from "@/lib/domain-error";

export async function getMessages() {
  return prisma.predefinedMessage.findMany({
    where: {
      OR: [
        { subDepartmentId: null },
        {
          subDepartment: {
            internalOnly: false,
            department: { internalOnly: false },
          },
        },
      ],
    },
    include: { subDepartment: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMessageById(id: number) {
  return prisma.predefinedMessage.findFirst({
    where: {
      id,
      OR: [
        { subDepartmentId: null },
        {
          subDepartment: {
            internalOnly: false,
            department: { internalOnly: false },
          },
        },
      ],
    },
    include: { subDepartment: { select: { id: true, name: true } } },
  });
}

const SHORT_CODE_REGEX = /^[a-zA-Z0-9_]+$/;

interface CreateMessageData {
  title: string;
  content: string;
  shortCode: string;
  subDepartmentId?: number | null;
}

export async function createMessage(data: CreateMessageData) {
  const { title, content, shortCode, subDepartmentId } = data;

  if (!title || !content || !shortCode) {
    throw validationError(errors.MESSAGE_REQUIRED_FIELDS);
  }

  if (!SHORT_CODE_REGEX.test(shortCode)) {
    throw validationError(errors.SHORT_CODE_INVALID);
  }

  const existing = await prisma.predefinedMessage.findUnique({
    where: { shortCode },
  });

  if (existing) {
    throw conflictError(errors.SHORT_CODE_EXISTS);
  }

  if (subDepartmentId) {
    const subDepartment = await prisma.subDepartment.findFirst({
      where: {
        id: subDepartmentId,
        internalOnly: false,
        department: { internalOnly: false },
      },
      select: { id: true },
    });
    if (!subDepartment) throw notFoundError(errors.SUB_DEPARTMENT_NOT_FOUND);
  }

  try {
    return await prisma.predefinedMessage.create({
      data: { title, content, shortCode, subDepartmentId: subDepartmentId ?? null },
      include: { subDepartment: { select: { id: true, name: true } } },
    });
  } catch (error) {
    rethrowPersistenceError(error, {
      unique: errors.SHORT_CODE_EXISTS,
      foreignKeyNotFound: errors.SUB_DEPARTMENT_NOT_FOUND,
    });
  }
}

interface UpdateMessageData {
  title?: string;
  content?: string;
  shortCode?: string;
  subDepartmentId?: number | null;
}

export async function updateMessage(id: number, data: UpdateMessageData) {
  const message = await prisma.predefinedMessage.findUnique({ where: { id } });
  if (!message) {
    throw notFoundError(errors.MESSAGE_NOT_FOUND);
  }

  if (data.shortCode && data.shortCode !== message.shortCode) {
    if (!SHORT_CODE_REGEX.test(data.shortCode)) {
      throw validationError(errors.SHORT_CODE_INVALID);
    }

    const existing = await prisma.predefinedMessage.findUnique({
      where: { shortCode: data.shortCode },
    });

    if (existing) {
      throw conflictError(errors.SHORT_CODE_EXISTS);
    }
  }

  if (typeof data.subDepartmentId === "number") {
    const subDepartment = await prisma.subDepartment.findFirst({
      where: {
        id: data.subDepartmentId,
        internalOnly: false,
        department: { internalOnly: false },
      },
      select: { id: true },
    });
    if (!subDepartment) throw notFoundError(errors.SUB_DEPARTMENT_NOT_FOUND);
  }

  const updateData: Record<string, unknown> = {};
  if (data.title) updateData.title = data.title;
  if (data.content) updateData.content = data.content;
  if (data.shortCode) updateData.shortCode = data.shortCode;
  if (data.subDepartmentId !== undefined) {
    updateData.subDepartmentId = data.subDepartmentId || null;
  }

  try {
    return await prisma.predefinedMessage.update({
      where: { id },
      data: updateData,
      include: { subDepartment: true },
    });
  } catch (error) {
    rethrowPersistenceError(error, {
      unique: errors.SHORT_CODE_EXISTS,
      notFound: errors.MESSAGE_NOT_FOUND,
      foreignKeyNotFound: errors.SUB_DEPARTMENT_NOT_FOUND,
    });
  }
}

export async function deleteMessage(id: number) {
  try {
    await prisma.predefinedMessage.delete({ where: { id } });
  } catch (error) {
    rethrowPersistenceError(error, { notFound: errors.MESSAGE_NOT_FOUND });
  }
}
