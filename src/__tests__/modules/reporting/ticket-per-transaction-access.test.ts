import { prisma } from "@/lib/prisma";
import { resolveReportingAccessScope } from "@/modules/reporting/application/reporting-authorization";
import { getTicketPerTransactionReport } from "@/modules/reporting/application/ticket-per-transaction-report-service";

jest.mock("@/lib/prisma", () => ({ prisma: { $transaction: jest.fn() } }));
jest.mock("@/modules/reporting/application/reporting-authorization", () => ({
  resolveReportingAccessScope: jest.fn(),
}));

describe("ticket-per-transaction access boundaries", () => {
  it("does not expose an organization-specific aggregate to audit-only access", async () => {
    (resolveReportingAccessScope as jest.Mock).mockResolvedValue({
      type: "GLOBAL",
      accessMode: "AUDIT",
      teamIds: null,
    });
    await expect(getTicketPerTransactionReport({
      actorUserId: 8,
      query: {
        from: new Date("2026-09-01T00:00:00.000Z"),
        to: new Date("2026-09-02T00:00:00.000Z"),
        providerCode: "PAYMENT_CORE",
        transactionType: "PAYMENT",
        organizationId: 4,
      },
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
