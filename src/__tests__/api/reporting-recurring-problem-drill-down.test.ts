import { GET } from "@/app/api/v2/reporting/kpis/recurring-problems/[signalKey]/tickets/route";
import { getRecurringProblemDrillDown } from "@/modules/reporting/application/recurring-problem-service";
import { requireReportingApiV2User } from "@/modules/shared/api-v2-authorization";

jest.mock("@/modules/reporting/application/recurring-problem-service", () => ({
  getRecurringProblemDrillDown: jest.fn(),
}));
jest.mock("@/modules/shared/api-v2-authorization", () => ({
  requireReportingApiV2User: jest.fn(),
}));

const signalKey = "a".repeat(64);
const request = () => new Request(
  `http://localhost/api/v2/reporting/kpis/recurring-problems/${signalKey}/tickets?limit=20`
);

describe("recurring problem controlled drill-down API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireReportingApiV2User as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 7 },
    });
  });

  it("passes only a validated signal and bounded limit to the scoped service", async () => {
    (getRecurringProblemDrillDown as jest.Mock).mockResolvedValue({ signal: { signalKey }, tickets: [] });
    const response = await GET(request(), { params: Promise.resolve({ signalKey }) });
    expect(response.status).toBe(200);
    expect(getRecurringProblemDrillDown).toHaveBeenCalledWith({
      actorUserId: 7,
      signalKey,
      limit: 20,
      range: undefined,
    });
  });

  it("passes the report range so an on-demand signal can be resolved", async () => {
    (getRecurringProblemDrillDown as jest.Mock).mockResolvedValue({ signal: { signalKey }, tickets: [] });
    const rangedRequest = new Request(
      `http://localhost/api/v2/reporting/kpis/recurring-problems/${signalKey}/tickets?limit=20&from=1405%2F06%2F10+00%3A00%3A00&to=1405%2F06%2F17+00%3A00%3A00`
    );

    const response = await GET(rangedRequest, { params: Promise.resolve({ signalKey }) });

    expect(response.status).toBe(200);
    expect(getRecurringProblemDrillDown).toHaveBeenCalledWith({
      actorUserId: 7,
      signalKey,
      limit: 20,
      range: {
        from: new Date("2026-08-31T20:30:00.000Z"),
        to: new Date("2026-09-07T20:30:00.000Z"),
      },
    });
  });

  it("rejects a partial report range", async () => {
    const partialRangeRequest = new Request(
      `http://localhost/api/v2/reporting/kpis/recurring-problems/${signalKey}/tickets?from=1405%2F06%2F10+00%3A00%3A00`
    );

    const response = await GET(partialRangeRequest, { params: Promise.resolve({ signalKey }) });

    expect(response.status).toBe(400);
    expect(getRecurringProblemDrillDown).not.toHaveBeenCalled();
  });

  it("rejects malformed signal identifiers before querying facts", async () => {
    const response = await GET(request(), { params: Promise.resolve({ signalKey: "not-a-key" }) });
    expect(response.status).toBe(400);
    expect(getRecurringProblemDrillDown).not.toHaveBeenCalled();
  });
});
