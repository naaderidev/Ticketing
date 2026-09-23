import { createHash, randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Prisma } from "@prisma/client";
import { getAttachmentConfig } from "@/lib/attachment-config";
import { inspectAttachment } from "@/lib/attachment-inspection";
import { scanAttachment } from "@/lib/attachment-scanner";
import {
  deletePrivateObject,
  readPrivateObject,
  storePrivateObject,
} from "@/lib/attachment-storage";
import { runSerializableTransaction } from "@/lib/database-transaction";
import { notFoundError, validationError } from "@/lib/domain-error";
import { prisma } from "@/lib/prisma";
import { errors } from "@/lib/strings";
import { logOperationalError } from "@/lib/operational-logger";

const MAX_PENDING_FILES_PER_USER = 20;
const MAX_PENDING_BYTES_PER_USER = 50 * 1024 * 1024;

export type AttachmentReference = { uploadId: string };

type AttachmentParent =
  | { kind: "ticket"; ticketId: number }
  | { kind: "reply"; replyId: number }
  | {
      kind: "message";
      messageId: bigint;
      ticketId?: number;
      replyId?: number;
    };

type StoredAttachmentReference = {
  storageKey: string | null;
  fileUrl: string | null;
};

export async function createPendingUpload(input: {
  uploaderId: number;
  originalName: string;
  declaredMediaType: string;
  content: Buffer;
}) {
  const inspected = inspectAttachment(
    input.originalName,
    input.declaredMediaType,
    input.content
  );

  await processAttachmentDeletionJobs(25);
  await cleanupExpiredPendingUploads(25);

  const pendingUsage = await prisma.pendingUpload.aggregate({
    where: {
      uploaderId: input.uploaderId,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
    _count: { _all: true },
    _sum: { fileSize: true },
  });
  if (
    pendingUsage._count._all >= MAX_PENDING_FILES_PER_USER ||
    (pendingUsage._sum.fileSize ?? 0) + inspected.fileSize >
      MAX_PENDING_BYTES_PER_USER
  ) {
    throw validationError(errors.FILE_PENDING_QUOTA_EXCEEDED);
  }

  await scanAttachment(input.content);

  const uploadId = randomUUID();
  const checksum = createHash("sha256").update(input.content).digest("hex");
  const storageKey = `attachments/${input.uploaderId}/${uploadId}`;
  const { pendingUploadTtlHours } = getAttachmentConfig();
  const expiresAt = new Date(
    Date.now() + pendingUploadTtlHours * 60 * 60 * 1000
  );

  await storePrivateObject(
    storageKey,
    input.content,
    inspected.fileType,
    checksum
  );

  try {
    await prisma.pendingUpload.create({
      data: {
        id: uploadId,
        uploaderId: input.uploaderId,
        storageKey,
        checksum,
        expiresAt,
        ...inspected,
      },
    });
  } catch (error) {
    try {
      await deletePrivateObject(storageKey);
    } catch (cleanupError) {
      logOperationalError("attachment_registration_cleanup_failed", cleanupError, {
        operation: "delete_unregistered_object",
      });
    }
    throw error;
  }

  return { uploadId, ...inspected, expiresAt };
}

export async function claimPendingUploads(
  transaction: Prisma.TransactionClient,
  references: AttachmentReference[] | undefined,
  uploaderId: number,
  parent: AttachmentParent
): Promise<void> {
  if (!references?.length) return;

  const uploadIds = references.map(({ uploadId }) => uploadId);
  const uploads = await transaction.pendingUpload.findMany({
    where: {
      id: { in: uploadIds },
      uploaderId,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
  });

  if (uploads.length !== uploadIds.length) {
    throw validationError(errors.FILE_REFERENCE_INVALID);
  }

  await transaction.ticketAttachment.createMany({
    data: uploads.map((upload) => ({
      ticketId:
        parent.kind === "ticket"
          ? parent.ticketId
          : parent.kind === "message"
            ? (parent.ticketId ?? null)
            : null,
      replyId:
        parent.kind === "reply"
          ? parent.replyId
          : parent.kind === "message"
            ? (parent.replyId ?? null)
            : null,
      messageId: parent.kind === "message" ? parent.messageId : null,
      fileName: upload.fileName,
      fileSize: upload.fileSize,
      fileType: upload.fileType,
      storageKey: upload.storageKey,
      checksum: upload.checksum,
      fileUrl: null,
    })),
  });

  const deleted = await transaction.pendingUpload.deleteMany({
    where: { id: { in: uploadIds }, uploaderId, status: "PENDING" },
  });
  if (deleted.count !== uploadIds.length) {
    throw validationError(errors.FILE_REFERENCE_INVALID);
  }
}

export async function removePendingUpload(
  uploadId: string,
  uploaderId: number
): Promise<void> {
  const upload = await runSerializableTransaction(async (transaction) => {
    const existing = await transaction.pendingUpload.findFirst({
      where: { id: uploadId, uploaderId },
    });
    if (!existing) throw notFoundError(errors.FILE_NOT_FOUND);

    return transaction.pendingUpload.update({
      where: { id: uploadId },
      data: { status: "DELETING" },
    });
  });

  await deletePrivateObject(upload.storageKey);
  await prisma.pendingUpload.deleteMany({
    where: { id: upload.id, uploaderId, status: "DELETING" },
  });
}

export async function cleanupExpiredPendingUploads(limit = 100): Promise<{
  deleted: number;
  failed: number;
}> {
  const uploads = await runSerializableTransaction(async (transaction) => {
    const candidates = await transaction.pendingUpload.findMany({
      where: {
        OR: [
          { status: "PENDING", expiresAt: { lte: new Date() } },
          { status: "DELETING" },
        ],
      },
      orderBy: { expiresAt: "asc" },
      take: limit,
    });
    if (!candidates.length) return [];

    const candidateIds = candidates.map(({ id }) => id);
    await transaction.pendingUpload.updateMany({
      where: { id: { in: candidateIds } },
      data: { status: "DELETING" },
    });
    return candidates;
  });

  let deleted = 0;
  let failed = 0;
  for (const upload of uploads) {
    try {
      await deletePrivateObject(upload.storageKey);
      await prisma.pendingUpload.deleteMany({
        where: { id: upload.id, status: "DELETING" },
      });
      deleted += 1;
    } catch (error) {
      failed += 1;
      logOperationalError("expired_attachment_cleanup_failed", error, {
        uploadId: upload.id,
      });
    }
  }

  return { deleted, failed };
}

function toObjectReference(attachment: StoredAttachmentReference): string | null {
  if (attachment.storageKey) return `s3:${attachment.storageKey}`;
  if (
    attachment.fileUrl &&
    /^\/uploads\/[a-zA-Z0-9._-]+$/.test(attachment.fileUrl)
  ) {
    return `legacy:${attachment.fileUrl}`;
  }
  return null;
}

export async function queueAttachmentDeletionJobs(
  transaction: Prisma.TransactionClient,
  attachments: StoredAttachmentReference[]
): Promise<void> {
  const objectReferences = attachments
    .map(toObjectReference)
    .filter((value): value is string => value !== null);
  if (!objectReferences.length) return;

  await transaction.attachmentDeletionJob.createMany({
    data: objectReferences.map((objectReference) => ({ objectReference })),
    skipDuplicates: true,
  });
}

async function deleteObjectReference(objectReference: string): Promise<void> {
  if (objectReference.startsWith("s3:")) {
    await deletePrivateObject(objectReference.slice(3));
    return;
  }
  if (objectReference.startsWith("legacy:/uploads/")) {
    const legacyUrl = objectReference.slice("legacy:".length);
    const legacyName = basename(legacyUrl);
    if (`/uploads/${legacyName}` !== legacyUrl) {
      throw new Error("Invalid legacy attachment deletion reference");
    }
    try {
      await unlink(join(process.cwd(), "public", "uploads", legacyName));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return;
  }
  throw new Error("Unknown attachment deletion reference");
}

export async function processAttachmentDeletionJobs(limit = 100): Promise<{
  deleted: number;
  failed: number;
}> {
  const jobs = await prisma.attachmentDeletionJob.findMany({
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let deleted = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await deleteObjectReference(job.objectReference);
      await prisma.attachmentDeletionJob.deleteMany({ where: { id: job.id } });
      deleted += 1;
    } catch (error) {
      failed += 1;
      await prisma.attachmentDeletionJob.updateMany({
        where: { id: job.id },
        data: {
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message.slice(0, 2_000) : "Unknown error",
        },
      });
    }
  }

  return { deleted, failed };
}

export async function migrateLegacyAttachments(limit = 25): Promise<{
  migrated: number;
  failed: number;
  remaining: number;
}> {
  const legacyAttachments = await prisma.ticketAttachment.findMany({
    where: { storageKey: null, fileUrl: { startsWith: "/uploads/" } },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      fileUrl: true,
    },
    orderBy: { id: "asc" },
    take: limit,
  });

  let migrated = 0;
  let failed = 0;
  for (const attachment of legacyAttachments) {
    try {
      if (
        !attachment.fileUrl ||
        !/^\/uploads\/[a-zA-Z0-9._-]+$/.test(attachment.fileUrl)
      ) {
        throw new Error("Invalid legacy attachment location");
      }
      const legacyName = basename(attachment.fileUrl);
      const content = await readFile(
        join(process.cwd(), "public", "uploads", legacyName)
      );
      const inspected = inspectAttachment(
        attachment.fileName,
        attachment.fileType,
        content
      );
      await scanAttachment(content);

      const checksum = createHash("sha256").update(content).digest("hex");
      const storageKey = `attachments/legacy/${attachment.id}`;
      await storePrivateObject(
        storageKey,
        content,
        inspected.fileType,
        checksum
      );

      const updated = await runSerializableTransaction(async (transaction) => {
        const result = await transaction.ticketAttachment.updateMany({
          where: {
            id: attachment.id,
            storageKey: null,
            fileUrl: attachment.fileUrl,
          },
          data: {
            ...inspected,
            storageKey,
            checksum,
            fileUrl: null,
          },
        });
        if (result.count === 1) {
          await queueAttachmentDeletionJobs(transaction, [
            { storageKey: null, fileUrl: attachment.fileUrl },
          ]);
        }
        return result.count;
      });
      migrated += updated;
    } catch (error) {
      failed += 1;
      logOperationalError("legacy_attachment_migration_failed", error, {
        attachmentId: attachment.id,
      });
    }
  }

  const remaining = await prisma.ticketAttachment.count({
    where: { storageKey: null, fileUrl: { startsWith: "/uploads/" } },
  });
  return { migrated, failed, remaining };
}

export async function getAttachmentForDownload(attachmentId: number) {
  return prisma.ticketAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      fileName: true,
      fileSize: true,
      fileType: true,
      storageKey: true,
      checksum: true,
      fileUrl: true,
      ticket: { select: { id: true, ticketId: true, userId: true, status: true } },
      reply: {
        select: {
          ticket: {
            select: { id: true, ticketId: true, userId: true, status: true },
          },
        },
      },
    },
  });
}

type DownloadableAttachment = NonNullable<
  Awaited<ReturnType<typeof getAttachmentForDownload>>
>;

export async function readAttachmentContent(
  attachment: DownloadableAttachment
): Promise<Uint8Array> {
  let content: Uint8Array;
  if (attachment.storageKey) {
    content = await readPrivateObject(attachment.storageKey);
  } else if (
    attachment.fileUrl &&
    /^\/uploads\/[a-zA-Z0-9._-]+$/.test(attachment.fileUrl)
  ) {
    const fileName = basename(attachment.fileUrl);
    content = await readFile(join(process.cwd(), "public", "uploads", fileName));
    const legacyContent = Buffer.from(content);
    inspectAttachment(attachment.fileName, attachment.fileType, legacyContent);
    await scanAttachment(legacyContent);
  } else {
    throw new Error("Attachment has no valid private or legacy storage location");
  }

  if (content.byteLength !== attachment.fileSize) {
    throw new Error("Attachment size does not match stored metadata");
  }
  if (attachment.checksum) {
    const actualChecksum = createHash("sha256")
      .update(content)
      .digest("hex");
    if (actualChecksum !== attachment.checksum) {
      throw new Error("Attachment checksum verification failed");
    }
  }

  return content;
}
