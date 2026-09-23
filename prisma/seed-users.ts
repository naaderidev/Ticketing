import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function requireSeedValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required to seed the initial administrator`);
  }
  return value;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development seed scripts must not run in production");
  }

  const mobile = requireSeedValue("SEED_ADMIN_MOBILE");
  const nationalCode = requireSeedValue("SEED_ADMIN_NATIONAL_CODE");
  const password = requireSeedValue("SEED_ADMIN_PASSWORD");

  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must contain at least 12 characters");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const firstName = requireSeedValue("SEED_ADMIN_FIRST_NAME");
  const lastName = requireSeedValue("SEED_ADMIN_LAST_NAME");
  const admin = await prisma.user.upsert({
    where: { mobile },
    update: {},
    create: {
      firstName,
      lastName,
      nationalCode,
      mobile,
      email: process.env.SEED_ADMIN_EMAIL?.trim() || null,
      birthday: process.env.SEED_ADMIN_BIRTHDAY?.trim() || null,
      role: "ADMIN",
      passwordHash,
    },
  });

  const personProfile = await prisma.personProfile.findUnique({
    where: { userId: admin.id },
    select: { id: true },
  });
  if (!personProfile) {
    await prisma.party.create({
      data: {
        type: "PERSON",
        displayName: `${admin.firstName} ${admin.lastName}`.trim(),
        personProfile: { create: { userId: admin.id } },
      },
    });
  }

  const systemAdministratorRole = await prisma.role.findUnique({
    where: { key: "SYSTEM_ADMINISTRATOR" },
    select: { id: true },
  });
  if (!systemAdministratorRole) {
    throw new Error(
      "SYSTEM_ADMINISTRATOR role is missing; apply database migrations before seeding"
    );
  }
  await prisma.userRoleAssignment.upsert({
    where: {
      userId_roleId_scopeType_scopeKey: {
        userId: admin.id,
        roleId: systemAdministratorRole.id,
        scopeType: "GLOBAL",
        scopeKey: "*",
      },
    },
    update: { status: "ACTIVE", validTo: null },
    create: {
      userId: admin.id,
      roleId: systemAdministratorRole.id,
      scopeType: "GLOBAL",
      scopeKey: "*",
      status: "ACTIVE",
    },
  });

  console.log("Initial administrator seed completed");
}

main()
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        event: "initial_administrator_seed_failed",
        service: "ticketing-system-seed",
        errorType: error instanceof Error ? error.name : "UnknownError",
      })
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
