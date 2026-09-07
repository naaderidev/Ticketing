import { prisma } from "@/lib/prisma";
import { errors } from "@/lib/strings";

export async function getUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
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
  email?: string;
  birthday?: string;
}

export async function createUser(data: CreateUserData) {
  const { firstName, lastName, nationalCode, mobile, email, birthday } = data;

  if (!firstName || !lastName || !nationalCode || !mobile) {
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

  return prisma.user.create({
    data: {
      firstName,
      lastName,
      nationalCode,
      mobile,
      email: email || null,
      birthday: birthday || null,
    },
  });
}
