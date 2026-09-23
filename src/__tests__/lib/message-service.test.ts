import { prisma } from "@/lib/prisma";
import {
  createMessage,
  deleteMessage,
  getMessageById,
  getMessages,
  updateMessage,
} from "@/lib/message-service";
import { errors } from "@/lib/strings";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    predefinedMessage: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    subDepartment: { findUnique: jest.fn(), findFirst: jest.fn() },
  },
}));

describe("predefined message service", () => {
  beforeEach(() => jest.clearAllMocks());

  it("loads the message list and one message", async () => {
    (prisma.predefinedMessage.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.predefinedMessage.findFirst as jest.Mock).mockResolvedValue({ id: 2 });

    await expect(getMessages()).resolves.toEqual([]);
    await expect(getMessageById(2)).resolves.toEqual({ id: 2 });
  });

  it("rejects missing fields and invalid short codes", async () => {
    await expect(
      createMessage({ title: "", content: "پاسخ", shortCode: "answer" })
    ).rejects.toMatchObject({ kind: "VALIDATION", message: errors.MESSAGE_REQUIRED_FIELDS });
    await expect(
      createMessage({ title: "عنوان", content: "پاسخ", shortCode: "bad code" })
    ).rejects.toMatchObject({ kind: "VALIDATION", message: errors.SHORT_CODE_INVALID });
  });

  it("rejects a duplicate short code", async () => {
    (prisma.predefinedMessage.findUnique as jest.Mock).mockResolvedValue({ id: 1 });

    await expect(
      createMessage({ title: "عنوان", content: "پاسخ", shortCode: "answer" })
    ).rejects.toMatchObject({ kind: "CONFLICT", message: errors.SHORT_CODE_EXISTS });
  });

  it("requires a referenced sub-department to exist", async () => {
    (prisma.predefinedMessage.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.subDepartment.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      createMessage({
        title: "عنوان",
        content: "پاسخ",
        shortCode: "answer",
        subDepartmentId: 10,
      })
    ).rejects.toMatchObject({ kind: "NOT_FOUND", message: errors.SUB_DEPARTMENT_NOT_FOUND });
  });

  it("creates a verified message", async () => {
    (prisma.predefinedMessage.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.subDepartment.findFirst as jest.Mock).mockResolvedValue({ id: 3 });
    (prisma.predefinedMessage.create as jest.Mock).mockResolvedValue({ id: 1 });

    await expect(
      createMessage({
        title: "عنوان",
        content: "پاسخ",
        shortCode: "answer_1",
        subDepartmentId: 3,
      })
    ).resolves.toEqual({ id: 1 });
    expect(prisma.predefinedMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shortCode: "answer_1", subDepartmentId: 3 }),
      })
    );
  });

  it("rejects updating a missing message", async () => {
    (prisma.predefinedMessage.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(updateMessage(7, { title: "جدید" })).rejects.toMatchObject({
      kind: "NOT_FOUND",
      message: errors.MESSAGE_NOT_FOUND,
    });
  });

  it("updates only supplied fields and permits clearing the category", async () => {
    (prisma.predefinedMessage.findUnique as jest.Mock).mockResolvedValue({
      id: 7,
      shortCode: "answer",
    });
    (prisma.predefinedMessage.update as jest.Mock).mockResolvedValue({ id: 7 });

    await updateMessage(7, { title: "جدید", subDepartmentId: null });
    expect(prisma.predefinedMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: "جدید", subDepartmentId: null } })
    );
  });

  it("deletes by id", async () => {
    (prisma.predefinedMessage.delete as jest.Mock).mockResolvedValue({ id: 3 });

    await expect(deleteMessage(3)).resolves.toBeUndefined();
    expect(prisma.predefinedMessage.delete).toHaveBeenCalledWith({ where: { id: 3 } });
  });
});
