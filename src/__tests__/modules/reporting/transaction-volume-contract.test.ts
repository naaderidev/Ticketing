import {
  ticketPerTransactionReportQuerySchema,
  transactionVolumeBatchSchema,
} from "@/modules/reporting/contracts/reporting-kpi-schemas";

const row = {
  transactionType: "PAYMENT",
  localDate: "2026-09-15",
  bucketStartedAt: "2026-09-14T20:30:00.000Z",
  bucketEndedAt: "2026-09-15T20:30:00.000Z",
  scopeType: "GLOBAL",
  successfulTransactionCount: "10000",
  totalTransactionCount: "10100",
  status: "VERIFIED",
};

describe("transaction-volume contracts", () => {
  it("accepts exact Tehran day boundaries and converts counts to bigint", () => {
    const parsed = transactionVolumeBatchSchema.parse({
      providerCode: "PAYMENT_CORE",
      sourceVersion: "daily-v1",
      rows: [row],
    });
    expect(parsed.rows[0].successfulTransactionCount).toBe(BigInt(10_000));
  });

  it("rejects duplicate buckets, unsafe counts and mismatched scope", () => {
    expect(transactionVolumeBatchSchema.safeParse({
      providerCode: "PAYMENT_CORE",
      sourceVersion: "daily-v1",
      rows: [row, row],
    }).success).toBe(false);
    expect(transactionVolumeBatchSchema.safeParse({
      providerCode: "PAYMENT_CORE",
      sourceVersion: "daily-v1",
      rows: [{ ...row, successfulTransactionCount: "9223372036854775808" }],
    }).success).toBe(false);
    expect(transactionVolumeBatchSchema.safeParse({
      providerCode: "PAYMENT_CORE",
      sourceVersion: "daily-v1",
      rows: [{ ...row, organizationId: 12 }],
    }).success).toBe(false);
  });

  it("requires report ranges to align to Tehran local midnight", () => {
    expect(ticketPerTransactionReportQuerySchema.safeParse({
      from: "2026-09-14T20:30:00.000Z",
      to: "2026-09-15T20:30:00.000Z",
      providerCode: "PAYMENT_CORE",
      transactionType: "PAYMENT",
    }).success).toBe(true);
    expect(ticketPerTransactionReportQuerySchema.safeParse({
      from: "2026-09-15T00:00:00.000Z",
      to: "2026-09-16T00:00:00.000Z",
      providerCode: "PAYMENT_CORE",
      transactionType: "PAYMENT",
    }).success).toBe(false);
  });
});
