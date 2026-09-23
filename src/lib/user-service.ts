import { prisma } from "@/lib/prisma";
import { errors } from "@/lib/strings";
import { hashPassword } from "@/lib/auth";
import {
  conflictError,
  notFoundError,
  rethrowPersistenceError,
  validationError,
} from "@/lib/domain-error";
import { runSerializableTransaction } from "@/lib/database-transaction";

export async function getUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nationalCode: true,
      mobile: true,
      email: true,
      birthday: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      roleAssignments: {
        where: { status: "ACTIVE" },
        select: { role: { select: { key: true, name: true } } },
      },
      organizationMemberships: {
        where: { status: "ACTIVE" },
        select: { role: true },
      },
    },
  }).then((users) =>
    users.map(({ roleAssignments, organizationMemberships, ...user }) => {
      const staffLabels = roleAssignments.map(({ role }) => role.name);
      const organizationLabels = organizationMemberships.map(({ role }) =>
        role === "MANAGER" ? "مدیر شرکت" : "نماینده شرکت",
      );
      return {
        ...user,
        access: {
          roleLabels: [
            ...new Set(
              staffLabels.length || organizationLabels.length
                ? [...staffLabels, ...organizationLabels]
                : ["کاربر فردی"],
            ),
          ],
          staffRoleKeys: [
            ...new Set(roleAssignments.map(({ role }) => role.key)),
          ],
          organizationRoleKeys: [
            ...new Set(organizationMemberships.map(({ role }) => role)),
          ],
        },
      };
    }),
  );
}

export async function getUserByMobile(mobile: string) {
  if (!mobile) {
    throw validationError(errors.MOBILE_REQUIRED);
  }

  const user = await prisma.user.findUnique({
    where: { mobile },
  });

  if (!user) {
    throw notFoundError(errors.USER_NOT_FOUND);
  }

  return user;
}

export async function findUserByMobile(mobile: string) {
  if (!mobile) return null;
  return prisma.user.findUnique({ where: { mobile } });
}

interface CreateUserData {
  firstName: string;
  lastName: string;
  nationalCode: string;
  mobile: string;
  password: string;
  email?: string;
  birthday?: string;
  role?: "USER" | "ADMIN";
}

export async function createUser(data: CreateUserData) {
  const { firstName, lastName, nationalCode, mobile, password, email, birthday, role } = data;

  if (!firstName || !lastName || !nationalCode || !mobile || !password) {
    throw validationError(errors.REQUIRED_FIELDS);
  }

  const passwordHash = await hashPassword(password);

  try {
    return await runSerializableTransaction(async (transaction) => {
      const existing = await transaction.user.findFirst({
        where: { OR: [{ nationalCode }, { mobile }] },
        select: { id: true },
      });
      if (existing) throw conflictError(errors.USER_ALREADY_EXISTS);

      const user = await transaction.user.create({
        data: {
          firstName,
          lastName,
          nationalCode,
          mobile,
          passwordHash,
          role: role || "USER",
          email: email || null,
          birthday: birthday || null,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          nationalCode: true,
          mobile: true,
          email: true,
          birthday: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await transaction.party.create({
        data: {
          type: "PERSON",
          displayName: `${user.firstName} ${user.lastName}`.trim(),
          personProfile: { create: { userId: user.id } },
        },
      });

      return user;
    });
  } catch (error) {
    rethrowPersistenceError(error, { unique: errors.USER_ALREADY_EXISTS });
  }
}

export async function updateUserRole(userId: number, role: "USER" | "ADMIN") {
  try {
    return await runSerializableTransaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) throw notFoundError(errors.USER_NOT_FOUND);

      const updatedUser = await transaction.user.update({
        where: { id: userId },
        data: { role },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          nationalCode: true,
          mobile: true,
          email: true,
          birthday: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      const systemAdministratorRole = await transaction.role.findUnique({
        where: { key: "SYSTEM_ADMINISTRATOR" },
        select: { id: true },
      });
      if (!systemAdministratorRole) {
        throw new Error("SYSTEM_ADMINISTRATOR role is not configured");
      }

      const assignmentKey = {
        userId,
        roleId: systemAdministratorRole.id,
        scopeType: "GLOBAL" as const,
        scopeKey: "*",
      };
      if (role === "ADMIN") {
        await transaction.userRoleAssignment.upsert({
          where: { userId_roleId_scopeType_scopeKey: assignmentKey },
          update: { status: "ACTIVE", validFrom: new Date(), validTo: null },
          create: { ...assignmentKey, status: "ACTIVE" },
        });
      } else {
        await transaction.userRoleAssignment.updateMany({
          where: assignmentKey,
          data: { status: "REVOKED", validTo: new Date() },
        });
      }
      await transaction.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return updatedUser;
    });
  } catch (error) {
    rethrowPersistenceError(error, { notFound: errors.USER_NOT_FOUND });
  }
}
