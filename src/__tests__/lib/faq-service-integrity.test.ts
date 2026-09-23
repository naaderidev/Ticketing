import { runSerializableTransaction } from "@/lib/database-transaction";
import { createFaq, reorderFaqs } from "@/lib/faq-service";
import { errors } from "@/lib/strings";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    fAQ: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock("@/lib/database-transaction", () => ({
  runSerializableTransaction: jest.fn(),
}));

const transaction = {
  department: { findUnique: jest.fn() },
  subDepartment: { findUnique: jest.fn() },
  fAQ: {
    aggregate: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

describe("FAQ service data integrity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (runSerializableTransaction as jest.Mock).mockImplementation(
      (operation) => operation(transaction)
    );
  });

  it("rejects a sub-department from another department", async () => {
    transaction.department.findUnique.mockResolvedValue({ id: 1 });
    transaction.subDepartment.findUnique.mockResolvedValue({
      id: 2,
      departmentId: 9,
    });

    await expect(
      createFaq({
        question: "پرسش",
        answer: "پاسخ",
        departmentId: "1",
        subDepartmentId: "2",
      })
    ).rejects.toMatchObject({
      kind: "VALIDATION",
      message: errors.SUB_DEPARTMENT_DEPARTMENT_MISMATCH,
    });
    expect(transaction.fAQ.create).not.toHaveBeenCalled();
  });

  it("checks every FAQ exists before applying a reorder", async () => {
    transaction.fAQ.findMany.mockResolvedValue([{ id: 1 }]);

    await expect(
      reorderFaqs([
        { id: 1, priority: 1 },
        { id: 2, priority: 2 },
      ])
    ).rejects.toMatchObject({
      kind: "NOT_FOUND",
      message: errors.FAQ_NOT_FOUND,
    });
    expect(transaction.fAQ.update).not.toHaveBeenCalled();
  });

  it("rejects duplicate IDs before opening a transaction", async () => {
    await expect(
      reorderFaqs([
        { id: 1, priority: 1 },
        { id: 1, priority: 2 },
      ])
    ).rejects.toMatchObject({ kind: "VALIDATION" });
    expect(runSerializableTransaction).not.toHaveBeenCalled();
  });
});
