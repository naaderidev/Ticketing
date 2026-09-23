import { hashPassword } from "@/lib/auth";
import { runSerializableTransaction } from "@/lib/database-transaction";
import { prisma } from "@/lib/prisma";
import {
  createUser,
  findUserByMobile,
  getUserByMobile,
  getUsers,
  updateUserRole,
} from "@/lib/user-service";
import { errors } from "@/lib/strings";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));
jest.mock("@/lib/auth", () => ({ hashPassword: jest.fn() }));
jest.mock("@/lib/database-transaction", () => ({
  runSerializableTransaction: jest.fn(),
}));

const transaction = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  party: { create: jest.fn() },
  role: { findUnique: jest.fn() },
  userRoleAssignment: { upsert: jest.fn(), updateMany: jest.fn() },
  session: { updateMany: jest.fn() },
};

const validUser = {
  firstName: "کاربر",
  lastName: "آزمایشی",
  nationalCode: "0013546849",
  mobile: "09121234567",
  password: "strong-password",
};

describe("user service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (runSerializableTransaction as jest.Mock).mockImplementation((operation) =>
      operation(transaction)
    );
  });

  it("loads users without password hashes", async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

    await expect(getUsers()).resolves.toEqual([]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.not.objectContaining({ passwordHash: true }) })
    );
  });

  it("validates lookup input and reports a missing user", async () => {
    await expect(getUserByMobile("")).rejects.toMatchObject({
      kind: "VALIDATION",
      message: errors.MOBILE_REQUIRED,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(getUserByMobile(validUser.mobile)).rejects.toMatchObject({
      kind: "NOT_FOUND",
      message: errors.USER_NOT_FOUND,
    });
  });

  it("does not query for an empty optional lookup", async () => {
    await expect(findUserByMobile("")).resolves.toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects incomplete and duplicate users", async () => {
    await expect(createUser({ ...validUser, firstName: "" })).rejects.toMatchObject({
      kind: "VALIDATION",
      message: errors.REQUIRED_FIELDS,
    });
    transaction.user.findFirst.mockResolvedValue({ id: 1 });
    await expect(createUser(validUser)).rejects.toMatchObject({
      kind: "CONFLICT",
      message: errors.USER_ALREADY_EXISTS,
    });
  });

  it("hashes the password and applies safe defaults when creating a user", async () => {
    transaction.user.findFirst.mockResolvedValue(null);
    (hashPassword as jest.Mock).mockResolvedValue("hashed");
    transaction.user.create.mockResolvedValue({
      id: 5,
      firstName: validUser.firstName,
      lastName: validUser.lastName,
      role: "USER",
    });
    transaction.party.create.mockResolvedValue({ id: 15 });

    await expect(createUser(validUser)).resolves.toMatchObject({ role: "USER" });
    expect(hashPassword).toHaveBeenCalledWith(validUser.password);
    expect(transaction.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: "hashed",
          role: "USER",
          email: null,
          birthday: null,
        }),
      })
    );
    expect(transaction.party.create).toHaveBeenCalledWith({
      data: {
        type: "PERSON",
        displayName: `${validUser.firstName} ${validUser.lastName}`,
        personProfile: { create: { userId: 5 } },
      },
    });
  });

  it("updates the role and revokes active sessions atomically", async () => {
    transaction.user.findUnique.mockResolvedValue({ id: 5 });
    transaction.user.update.mockResolvedValue({ id: 5, role: "ADMIN" });
    transaction.role.findUnique.mockResolvedValue({ id: 3 });
    transaction.userRoleAssignment.upsert.mockResolvedValue({ id: 9 });
    transaction.session.updateMany.mockResolvedValue({ count: 2 });

    await expect(updateUserRole(5, "ADMIN")).resolves.toMatchObject({ role: "ADMIN" });
    expect(transaction.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 5, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(transaction.userRoleAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_roleId_scopeType_scopeKey: {
            userId: 5,
            roleId: 3,
            scopeType: "GLOBAL",
            scopeKey: "*",
          },
        },
      })
    );
  });

  it("does not update the role when the user is missing", async () => {
    transaction.user.findUnique.mockResolvedValue(null);

    await expect(updateUserRole(99, "ADMIN")).rejects.toMatchObject({
      kind: "NOT_FOUND",
      message: errors.USER_NOT_FOUND,
    });
    expect(transaction.user.update).not.toHaveBeenCalled();
  });
});
