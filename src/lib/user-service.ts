import { prisma } from "@/lib/prisma";
import { errors } from "@/lib/strings";
import { hashPassword } from "@/lib/auth";

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
    },
  });
}

export async function getUserByMobile(mobile: string) {
  if (!mobile) {
    throw new Error(errors.MOBILE_REQUIRED);
  }

  const user = await prisma.user.findUnique({
    where: { mobile },
  });

  if (!user) {
    throw new Error(errors.USER_NOT_FOUND);
  }

  return user;
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
    throw new Error(errors.REQUIRED_FIELDS);
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ nationalCode }, { mobile }],
    },
  });

  if (existing) {
    throw new Error(errors.USER_ALREADY_EXISTS);
  }

  const passwordHash = await hashPassword(password);

  return prisma.user.create({
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
}

export async function updateUserRole(userId: number, role: "USER" | "ADMIN") {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw new Error(errors.USER_NOT_FOUND);
  }

  return prisma.user.update({
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
}
