import { getDepartments, createDepartment } from "@/lib/department-service";

jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({
      status: init?.status || 200,
      json: () => Promise.resolve(body),
    })),
  },
}));

jest.mock("@/lib/department-service", () => ({
  getDepartments: jest.fn(),
  createDepartment: jest.fn(),
}));

describe("Departments API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET", () => {
    it("should return departments successfully", async () => {
      const mockDepartments = [
        { id: 1, name: "Department 1", _count: { subDepartments: 2 } },
        { id: 2, name: "Department 2", _count: { subDepartments: 1 } },
      ];
      (getDepartments as jest.Mock).mockResolvedValue(mockDepartments);

      const { GET } = await import("@/app/api/departments/route");
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockDepartments);
    });

    it("should return error when fetch fails", async () => {
      (getDepartments as jest.Mock).mockRejectedValue(new Error("Database error"));

      const { GET } = await import("@/app/api/departments/route");
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeDefined();
    });
  });

  describe("POST", () => {
    it("should create department successfully", async () => {
      const mockDepartment = { id: 1, name: "New Department" };
      (createDepartment as jest.Mock).mockResolvedValue(mockDepartment);

      const request = new Request("http://localhost/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Department" }),
      });

      const { POST } = await import("@/app/api/departments/route");
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual(mockDepartment);
    });

    it("should return 400 for invalid data", async () => {
      const request = new Request("http://localhost/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      });

      const { POST } = await import("@/app/api/departments/route");
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
    });

    it("should handle duplicate department error", async () => {
      (createDepartment as jest.Mock).mockRejectedValue(
        new Error("این دپارتمان قبلاً ایجاد شده است")
      );

      const request = new Request("http://localhost/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Existing Department" }),
      });

      const { POST } = await import("@/app/api/departments/route");
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toContain("قبلاً");
    });
  });
});