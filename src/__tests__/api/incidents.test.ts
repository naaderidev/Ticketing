import { GET as getCustomerIncidents } from "@/app/api/v2/incidents/route";
import {
  GET as getWorkspaceIncidents,
  POST as createWorkspaceIncidentRoute,
} from "@/app/api/v2/workspace/incidents/route";
import {
  createWorkspaceIncident,
  listCustomerIncidents,
  listWorkspaceIncidents,
} from "@/modules/incidents/application/incident-service";
import {
  requireApiV2User,
  requireWorkspaceApiV2User,
} from "@/modules/shared/api-v2-authorization";

jest.mock("@/modules/incidents/application/incident-service", () => ({
  createWorkspaceIncident: jest.fn(),
  listCustomerIncidents: jest.fn(),
  listWorkspaceIncidents: jest.fn(),
}));
jest.mock("@/modules/shared/api-v2-authorization", () => ({
  requireApiV2User: jest.fn(),
  requireWorkspaceApiV2User: jest.fn(),
}));

const user = {
  id: 2,
  mobile: "09120000002",
  firstName: "بهاره",
  lastName: "نادری",
  role: "ADMIN",
  sessionId: "379bb0d9-282e-4674-b087-ab738ccd009d",
};

describe("operational incidents API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireApiV2User as jest.Mock).mockResolvedValue({ authorized: true, user });
    (requireWorkspaceApiV2User as jest.Mock).mockResolvedValue({ authorized: true, user });
  });

  it("returns only customer-visible incidents through the customer endpoint", async () => {
    (listCustomerIncidents as jest.Mock).mockResolvedValue([{ incidentKey: "INC-DEMO" }]);
    const response = await getCustomerIncidents(new Request("http://localhost/api/v2/incidents"));
    expect(response.status).toBe(200);
    expect(listCustomerIncidents).toHaveBeenCalledWith(user);
  });

  it("returns the staff incident workspace", async () => {
    (listWorkspaceIncidents as jest.Mock).mockResolvedValue([{ incidentKey: "INC-DEMO" }]);
    const response = await getWorkspaceIncidents(new Request("http://localhost/api/v2/workspace/incidents"));
    expect(response.status).toBe(200);
    expect(listWorkspaceIncidents).toHaveBeenCalledWith(user);
  });

  it("creates an incident with linked ticket audiences", async () => {
    const body = {
      title: "اختلال پرداخت",
      description: "چند کاربر هم‌زمان با کندی پرداخت روبه‌رو شده‌اند.",
      severity: "HIGH",
      sourceType: "MANUAL",
      impactedPartyIds: [],
      linkedTicketIds: ["TK-DEMO-0001"],
    };
    (createWorkspaceIncident as jest.Mock).mockResolvedValue({ incidentKey: "INC-NEW" });
    const response = await createWorkspaceIncidentRoute(new Request("http://localhost/api/v2/workspace/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
    expect(response.status).toBe(201);
    expect(createWorkspaceIncident).toHaveBeenCalledWith(user, body);
  });
});
