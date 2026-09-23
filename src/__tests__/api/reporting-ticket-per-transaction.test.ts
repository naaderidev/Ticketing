import { GET } from "@/app/api/v2/reporting/kpis/ticket-per-transaction/route";
import { getTicketPerTransactionReport } from "@/modules/reporting/application/ticket-per-transaction-report-service";
import { requireReportingApiV2User } from "@/modules/shared/api-v2-authorization";

jest.mock("@/modules/reporting/application/ticket-per-transaction-report-service", () => ({
  getTicketPerTransactionReport: jest.fn(),
}));
jest.mock("@/modules/shared/api-v2-authorization", () => ({
  requireReportingApiV2User: jest.fn(),
}));

const validUrl = "http://localhost/api/v2/reporting/kpis/ticket-per-transaction?from=2026-09-14T20%3A30%3A00.000Z&to=2026-09-15T20%3A30%3A00.000Z&providerCode=PAYMENT_CORE&transactionType=PAYMENT";

describe("ticket-per-transaction reporting API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireReportingApiV2User as jest.Mock).mockResolvedValue({ authorized: true, user: { id: 7 } });
  });

  it("returns the versioned private report", async () => {
    (getTicketPerTransactionReport as jest.Mock).mockResolvedValue({ definitionVersion: "KPI-V1" });
    const response = await GET(new Request(validUrl));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getTicketPerTransactionReport).toHaveBeenCalledWith({
      actorUserId: 7,
      query: expect.objectContaining({ providerCode: "PAYMENT_CORE", transactionType: "PAYMENT" }),
    });
  });

  it("rejects a missing provider before reading data", async () => {
    const response = await GET(new Request(validUrl.replace("&providerCode=PAYMENT_CORE", "")));
    expect(response.status).toBe(400);
    expect(getTicketPerTransactionReport).not.toHaveBeenCalled();
  });
});
