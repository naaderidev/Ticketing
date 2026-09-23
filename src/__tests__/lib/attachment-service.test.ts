import {
  claimPendingUploads,
  createPendingUpload,
  processAttachmentDeletionJobs,
  queueAttachmentDeletionJobs,
} from "@/lib/attachment-service";
import { scanAttachment } from "@/lib/attachment-scanner";
import {
  deletePrivateObject,
  storePrivateObject,
} from "@/lib/attachment-storage";
import { runSerializableTransaction } from "@/lib/database-transaction";
import { prisma } from "@/lib/prisma";
import { errors } from "@/lib/strings";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    attachmentDeletionJob: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
    pendingUpload: {
      aggregate: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/database-transaction", () => ({
  runSerializableTransaction: jest.fn(),
}));

jest.mock("@/lib/attachment-config", () => ({
  getAttachmentConfig: jest.fn(() => ({ pendingUploadTtlHours: 24 })),
}));

jest.mock("@/lib/attachment-scanner", () => ({ scanAttachment: jest.fn() }));

jest.mock("@/lib/attachment-storage", () => ({
  deletePrivateObject: jest.fn(),
  readPrivateObject: jest.fn(),
  storePrivateObject: jest.fn(),
}));

const cleanupTransaction = {
  pendingUpload: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
};

describe("attachment service", () => {
  beforeEach(() => {
    (runSerializableTransaction as jest.Mock).mockImplementation((operation) =>
      operation(cleanupTransaction)
    );
    cleanupTransaction.pendingUpload.findMany.mockResolvedValue([]);
    (prisma.attachmentDeletionJob.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.pendingUpload.aggregate as jest.Mock).mockResolvedValue({
      _count: { _all: 0 },
      _sum: { fileSize: null },
    });
    (prisma.pendingUpload.create as jest.Mock).mockResolvedValue({ id: "upload" });
  });

  it("scans and stores verified metadata in private storage", async () => {
    const content = Buffer.from("%PDF-1.7\n");

    const result = await createPendingUpload({
      uploaderId: 7,
      originalName: "report.pdf",
      declaredMediaType: "application/pdf",
      content,
    });

    expect(scanAttachment).toHaveBeenCalledWith(content);
    expect(storePrivateObject).toHaveBeenCalledWith(
      expect.stringMatching(/^attachments\/7\//),
      content,
      "application/pdf",
      expect.stringMatching(/^[a-f0-9]{64}$/)
    );
    expect(prisma.pendingUpload.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        uploaderId: 7,
        fileName: "report.pdf",
        fileType: "application/pdf",
        fileSize: content.length,
      }),
    });
    expect(result.uploadId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("removes the private object when registering pending metadata fails", async () => {
    (prisma.pendingUpload.create as jest.Mock).mockRejectedValueOnce(
      new Error("database unavailable")
    );

    await expect(
      createPendingUpload({
        uploaderId: 7,
        originalName: "report.pdf",
        declaredMediaType: "application/pdf",
        content: Buffer.from("%PDF-1.7\n"),
      })
    ).rejects.toThrow("database unavailable");

    expect(deletePrivateObject).toHaveBeenCalledTimes(1);
  });

  it("claims only current pending uploads owned by the actor", async () => {
    const transaction = {
      pendingUpload: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "7e77c970-75ae-4f2e-a296-6d5183c9f12a",
            uploaderId: 7,
            fileName: "verified.pdf",
            fileSize: 10,
            fileType: "application/pdf",
            storageKey: "attachments/7/file",
            checksum: "a".repeat(64),
          },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      ticketAttachment: { createMany: jest.fn() },
    };

    await claimPendingUploads(
      transaction as never,
      [{ uploadId: "7e77c970-75ae-4f2e-a296-6d5183c9f12a" }],
      7,
      { kind: "ticket", ticketId: 10 }
    );

    expect(transaction.pendingUpload.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ uploaderId: 7, status: "PENDING" }),
    });
    expect(transaction.ticketAttachment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          ticketId: 10,
          replyId: null,
          fileName: "verified.pdf",
          storageKey: "attachments/7/file",
        }),
      ],
    });
  });

  it("supports a canonical message attachment without a legacy ticket or reply parent", async () => {
    const transaction = {
      pendingUpload: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "92e1a070-ad8d-45f7-af56-e77b069729f1",
            uploaderId: 7,
            fileName: "internal-note.png",
            fileSize: 12,
            fileType: "image/png",
            storageKey: "attachments/7/internal-note",
            checksum: "b".repeat(64),
          },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      ticketAttachment: { createMany: jest.fn() },
    };

    await claimPendingUploads(
      transaction as never,
      [{ uploadId: "92e1a070-ad8d-45f7-af56-e77b069729f1" }],
      7,
      { kind: "message", messageId: BigInt(42) }
    );

    expect(transaction.ticketAttachment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          ticketId: null,
          replyId: null,
          messageId: BigInt(42),
          storageKey: "attachments/7/internal-note",
        }),
      ],
    });
  });

  it("rejects missing, expired, already claimed, or foreign upload references", async () => {
    const transaction = {
      pendingUpload: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
      ticketAttachment: { createMany: jest.fn() },
    };

    await expect(
      claimPendingUploads(
        transaction as never,
        [{ uploadId: "7e77c970-75ae-4f2e-a296-6d5183c9f12a" }],
        99,
        { kind: "reply", replyId: 12 }
      )
    ).rejects.toMatchObject({
      kind: "VALIDATION",
      message: errors.FILE_REFERENCE_INVALID,
    });
    expect(transaction.ticketAttachment.createMany).not.toHaveBeenCalled();
  });

  it("queues only valid private and legacy object references", async () => {
    const transaction = {
      attachmentDeletionJob: { createMany: jest.fn() },
    };

    await queueAttachmentDeletionJobs(transaction as never, [
      { storageKey: "attachments/7/private", fileUrl: null },
      { storageKey: null, fileUrl: "/uploads/legacy.pdf" },
      { storageKey: null, fileUrl: "https://attacker.example/file" },
    ]);

    expect(transaction.attachmentDeletionJob.createMany).toHaveBeenCalledWith({
      data: [
        { objectReference: "s3:attachments/7/private" },
        { objectReference: "legacy:/uploads/legacy.pdf" },
      ],
      skipDuplicates: true,
    });
  });

  it("processes durable S3 deletion jobs idempotently", async () => {
    (prisma.attachmentDeletionJob.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 3, objectReference: "s3:attachments/7/private" },
    ]);

    await expect(processAttachmentDeletionJobs(10)).resolves.toEqual({
      deleted: 1,
      failed: 0,
    });

    expect(deletePrivateObject).toHaveBeenCalledWith("attachments/7/private");
    expect(prisma.attachmentDeletionJob.deleteMany).toHaveBeenCalledWith({
      where: { id: 3 },
    });
  });
});
