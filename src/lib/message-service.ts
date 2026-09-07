import { prisma } from "@/lib/prisma";
import { errors } from "@/lib/strings";

export async function getMessages() {
  return prisma.predefinedMessage.findMany({
    include: { subDepartment: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMessageById(id: number) {
  return prisma.predefinedMessage.findUnique({
    where: { id },
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
    throw new Error(errors.MESSAGE_REQUIRED_FIELDS);
  }

  if (!SHORT_CODE_REGEX.test(shortCode)) {
    throw new Error(errors.SHORT_CODE_INVALID);
  }

  const existing = await prisma.predefinedMessage.findUnique({
    where: { shortCode },
  });

  if (existing) {
    throw new Error(errors.SHORT_CODE_EXISTS);
  }

  return prisma.predefinedMessage.create({
    data: {
      title,
      content,
      shortCode,
      subDepartmentId: subDepartmentId || null,
    },
    include: { subDepartment: { select: { id: true, name: true } } },
  });
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
    throw new Error(errors.MESSAGE_NOT_FOUND);
  }

  if (data.shortCode && data.shortCode !== message.shortCode) {
    if (!SHORT_CODE_REGEX.test(data.shortCode)) {
      throw new Error(errors.SHORT_CODE_INVALID);
    }

    const existing = await prisma.predefinedMessage.findUnique({
      where: { shortCode: data.shortCode },
    });

    if (existing) {
      throw new Error(errors.SHORT_CODE_EXISTS);
    }
  }

  const updateData: Record<string, unknown> = {};
  if (data.title) updateData.title = data.title;
  if (data.content) updateData.content = data.content;
  if (data.shortCode) updateData.shortCode = data.shortCode;
  if (data.subDepartmentId !== undefined) {
    updateData.subDepartmentId = data.subDepartmentId || null;
  }

  return prisma.predefinedMessage.update({
    where: { id },
    data: updateData,
    include: { subDepartment: true },
  });
}

export async function deleteMessage(id: number) {
  await prisma.predefinedMessage.delete({ where: { id } });
}
