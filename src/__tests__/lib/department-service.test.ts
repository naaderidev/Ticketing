import { prisma } from "@/lib/prisma";
import {
  createDepartment,
  createSubDepartment,
  deleteDepartment,
  getAllSubDepartments,
  getDepartmentById,
  getDepartments,
  updateSubDepartment,
} from "@/lib/department-service";
import { errors } from "@/lib/strings";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    department: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    subDepartment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ticket: { findFirst: jest.fn() },
  },
}));

describe("department service", () => {
  beforeEach(() => jest.clearAllMocks());

  it("loads departments with the stable list shape", async () => {
    (prisma.department.findMany as jest.Mock).mockResolvedValue([]);

    await expect(getDepartments()).resolves.toEqual([]);
    expect(prisma.department.findMany).toHaveBeenCalledWith({
      include: {
        subDepartments: { where: { internalOnly: false } },
        _count: { select: { tickets: true, subDepartments: true } },
      },
      orderBy: { name: "asc" },
      where: { internalOnly: false },
    });
  });

  it("loads one department and all sub-departments", async () => {
    (prisma.department.findFirst as jest.Mock).mockResolvedValue({ id: 4 });
    (prisma.subDepartment.findMany as jest.Mock).mockResolvedValue([]);

    await expect(getDepartmentById(4)).resolves.toEqual({ id: 4 });
    await expect(getAllSubDepartments()).resolves.toEqual([]);
  });

  it("rejects an empty department name before querying", async () => {
    await expect(createDepartment("   ")).rejects.toMatchObject({
      kind: "VALIDATION",
      message: errors.DEPARTMENT_NAME_REQUIRED,
    });
    expect(prisma.department.findFirst).not.toHaveBeenCalled();
  });

  it("trims and creates a unique department", async () => {
    (prisma.department.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.department.create as jest.Mock).mockResolvedValue({ id: 1, name: "فنی" });

    await expect(createDepartment("  فنی  ")).resolves.toMatchObject({ name: "فنی" });
    expect(prisma.department.create).toHaveBeenCalledWith({ data: { name: "فنی" } });
  });

  it("rejects a duplicate department", async () => {
    (prisma.department.findFirst as jest.Mock).mockResolvedValue({ id: 1 });

    await expect(createDepartment("فنی")).rejects.toMatchObject({
      kind: "CONFLICT",
      message: errors.DEPARTMENT_ALREADY_EXISTS,
    });
  });

  it("requires the parent before creating a sub-department", async () => {
    (prisma.department.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(createSubDepartment(99, "شبکه")).rejects.toMatchObject({
      kind: "NOT_FOUND",
      message: errors.DEPARTMENT_NOT_FOUND,
    });
    expect(prisma.subDepartment.create).not.toHaveBeenCalled();
  });

  it("rejects deletion when tickets still reference a department", async () => {
    (prisma.ticket.findFirst as jest.Mock).mockResolvedValue({ id: 1 });

    await expect(deleteDepartment(1)).rejects.toMatchObject({
      kind: "CONFLICT",
      message: errors.DEPARTMENT_HAS_TICKETS,
    });
    expect(prisma.department.delete).not.toHaveBeenCalled();
  });

  it("rejects updating a missing sub-department", async () => {
    (prisma.subDepartment.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(updateSubDepartment(8, "شبکه")).rejects.toMatchObject({
      kind: "NOT_FOUND",
      message: errors.SUB_DEPARTMENT_NOT_FOUND,
    });
  });
});
