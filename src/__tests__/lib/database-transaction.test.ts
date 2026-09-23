import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runSerializableTransaction } from "@/lib/database-transaction";

jest.mock("@/lib/prisma", () => ({
  prisma: { $transaction: jest.fn() },
}));

describe("serializable database transactions", () => {
  const operation = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses serializable isolation and production-safe timeouts", async () => {
    (prisma.$transaction as jest.Mock).mockResolvedValueOnce("done");

    await expect(runSerializableTransaction(operation)).resolves.toBe("done");
    expect(prisma.$transaction).toHaveBeenCalledWith(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    });
  });

  it("retries write conflicts up to the bounded limit", async () => {
    (prisma.$transaction as jest.Mock)
      .mockRejectedValueOnce({ code: "P2034" })
      .mockRejectedValueOnce({ code: "P2034" })
      .mockResolvedValueOnce("done");

    await expect(runSerializableTransaction(operation)).resolves.toBe("done");
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it("does not retry unrelated failures", async () => {
    const failure = { code: "P2002" };
    (prisma.$transaction as jest.Mock).mockRejectedValueOnce(failure);

    await expect(runSerializableTransaction(operation)).rejects.toBe(failure);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
