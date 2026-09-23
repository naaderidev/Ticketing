import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPersistenceErrorCode } from "@/lib/domain-error";

const MAX_TRANSACTION_ATTEMPTS = 3;

export async function runSerializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
      });
    } catch (error) {
      const canRetry =
        getPersistenceErrorCode(error) === "P2034" &&
        attempt < MAX_TRANSACTION_ATTEMPTS;
      if (!canRetry) throw error;
    }
  }

  throw new Error("Transaction retry loop exited unexpectedly");
}
