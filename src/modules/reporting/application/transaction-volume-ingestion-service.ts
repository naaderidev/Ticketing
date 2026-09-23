import { createHash } from "node:crypto";
import { Prisma, type TransactionVolumeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  conflictError,
  getPersistenceErrorCode,
  notFoundError,
} from "@/lib/domain-error";
import type { TransactionVolumeBatch } from "@/modules/reporting/contracts/reporting-kpi-schemas";
import { reportingDateColumn } from "@/modules/reporting/domain/reporting-local-date";

function checksum(input: {
  providerCode: string;
  sourceVersion: string;
  row: TransactionVolumeBatch["rows"][number];
}): string {
  const row = input.row;
  return createHash("sha256")
    .update(
      JSON.stringify({
        providerCode: input.providerCode,
        sourceVersion: input.sourceVersion,
        transactionType: row.transactionType,
        localDate: row.localDate,
        bucketStartedAt: row.bucketStartedAt.toISOString(),
        bucketEndedAt: row.bucketEndedAt.toISOString(),
        scopeType: row.scopeType,
        organizationId: row.organizationId ?? null,
        successfulTransactionCount: row.successfulTransactionCount.toString(),
        totalTransactionCount: row.totalTransactionCount?.toString() ?? null,
      })
    )
    .digest("hex");
}

function canTransitionStatus(
  from: TransactionVolumeStatus,
  to: TransactionVolumeStatus
): boolean {
  if (from === to) return true;
  if (from === "PROVISIONAL") return to === "VERIFIED" || to === "REJECTED";
  return from === "VERIFIED" && to === "REJECTED";
}

async function ingestTransactionVolumesOnce(batch: TransactionVolumeBatch) {
  return prisma.$transaction(
    async (transaction) => {
      const organizationIds = [
        ...new Set(
          batch.rows.flatMap((row) =>
            row.organizationId === undefined ? [] : [row.organizationId]
          )
        ),
      ];
      if (organizationIds.length > 0) {
        const organizations = await transaction.organization.findMany({
          where: { id: { in: organizationIds } },
          select: { id: true },
        });
        if (organizations.length !== organizationIds.length) {
          throw notFoundError("حداقل یکی از سازمان‌های سطل تراکنش یافت نشد");
        }
      }

      let inserted = 0;
      let replayed = 0;
      let statusUpdated = 0;
      for (const row of batch.rows) {
        const localDate = reportingDateColumn(row.localDate);
        const scopeKey = row.organizationId?.toString() ?? "*";
        const sourceChecksum = checksum({
          providerCode: batch.providerCode,
          sourceVersion: batch.sourceVersion,
          row,
        });
        const where = {
          providerCode_transactionType_localDate_scopeType_scopeKey: {
            providerCode: batch.providerCode,
            transactionType: row.transactionType,
            localDate,
            scopeType: row.scopeType,
            scopeKey,
          },
        } as const;
        const existing = await transaction.transactionVolumeDaily.findUnique({
          where,
          select: { id: true, sourceChecksum: true, status: true },
        });

        if (!existing) {
          await transaction.transactionVolumeDaily.create({
            data: {
              providerCode: batch.providerCode,
              transactionType: row.transactionType,
              localDate,
              bucketStartedAt: row.bucketStartedAt,
              bucketEndedAt: row.bucketEndedAt,
              scopeType: row.scopeType,
              scopeKey,
              organizationId: row.organizationId,
              successfulTransactionCount: row.successfulTransactionCount,
              totalTransactionCount: row.totalTransactionCount,
              sourceVersion: batch.sourceVersion,
              sourceChecksum,
              status: row.status,
            },
          });
          inserted += 1;
          continue;
        }
        if (existing.sourceChecksum !== sourceChecksum) {
          throw conflictError(
            `سطل ${row.transactionType}/${row.localDate}/${scopeKey} قبلاً با محتوای دیگری ثبت شده است`
          );
        }
        if (!canTransitionStatus(existing.status, row.status)) {
          throw conflictError(
            `بازگرداندن وضعیت سطل ${row.transactionType}/${row.localDate}/${scopeKey} مجاز نیست`
          );
        }
        if (existing.status === row.status) {
          replayed += 1;
          continue;
        }
        await transaction.transactionVolumeDaily.update({
          where: { id: existing.id },
          data: { status: row.status, importedAt: new Date() },
        });
        statusUpdated += 1;
      }

      return {
        providerCode: batch.providerCode,
        sourceVersion: batch.sourceVersion,
        received: batch.rows.length,
        inserted,
        replayed,
        statusUpdated,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function ingestTransactionVolumes(batch: TransactionVolumeBatch) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await ingestTransactionVolumesOnce(batch);
    } catch (error) {
      const code = getPersistenceErrorCode(error);
      const isConcurrentConflict = code === "P2002" || code === "P2034";
      if (isConcurrentConflict && attempt < 3) continue;
      if (isConcurrentConflict) {
        throw conflictError(
          "ثبت هم‌زمان حجم تراکنش تکمیل نشد؛ بسته را دوباره ارسال کنید",
          error
        );
      }
      throw error;
    }
  }
  throw new Error("Unreachable transaction-volume retry state");
}
