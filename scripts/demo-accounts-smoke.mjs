import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const demoAccounts = JSON.parse(
  readFileSync(
    new URL("../src/config/demo-accounts.json", import.meta.url),
    "utf8"
  )
);

const REQUIRED_TICKET_STATUSES = [
  "NEW",
  "UNASSIGNED",
  "IN_PROGRESS",
  "WAITING_USER",
  "WAITING_INTERNAL",
  "INTERNAL_REFERRAL",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyAccount(account, user) {
  requireCondition(user, `Missing demo account: ${account.displayName}`);
  requireCondition(user.firstName === account.firstName, `First name mismatch: ${account.displayName}`);
  requireCondition(user.lastName === account.lastName, `Last name mismatch: ${account.displayName}`);
  requireCondition(user.role === account.role, `Role mismatch: ${account.displayName}`);
  requireCondition(user.email === account.email, `Email mismatch: ${account.displayName}`);
  requireCondition(user.birthday === account.birthday, `Birthday mismatch: ${account.displayName}`);
  requireCondition(
    await bcrypt.compare(account.password, user.passwordHash),
    `Password mismatch: ${account.displayName}`
  );
}

async function main() {
  requireCondition(
    new Set(demoAccounts.map((account) => account.key)).size === demoAccounts.length,
    "Demo account keys must be unique"
  );
  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    include: {
      _count: { select: { tickets: true, ownedTickets: true } },
      roleAssignments: {
        where: { status: "ACTIVE" },
        select: {
          scopeType: true,
          scopeKey: true,
          supportTeamId: true,
          role: { select: { key: true } },
        },
      },
      organizationMemberships: {
        where: { status: "ACTIVE" },
        select: { role: true },
      },
    },
  });
  requireCondition(users.length === 12, "Database must contain exactly 12 demo users");

  const userByMobile = new Map(users.map((user) => [user.mobile, user]));
  for (const account of demoAccounts) {
    await verifyAccount(account, userByMobile.get(account.mobile));
  }

  const staff = users.filter((user) => user.role === "ADMIN");
  const customers = users.filter((user) => user.role === "USER");
  requireCondition(
    staff.length === demoAccounts.filter((account) => account.role === "ADMIN").length,
    "Database staff persona count does not match demo configuration"
  );
  requireCondition(
    customers.length === demoAccounts.filter((account) => account.role === "USER").length,
    "Database customer persona count does not match demo configuration"
  );
  requireCondition(
    staff.some((user) => user._count.ownedTickets > 0),
    "At least one team-scoped support persona must own a ticket"
  );
  for (const account of demoAccounts) {
    const user = userByMobile.get(account.mobile);
    if (account.staffRoleKey) {
      requireCondition(
        user.roleAssignments.some((assignment) => assignment.role.key === account.staffRoleKey),
        `Missing ${account.staffRoleKey} assignment for ${account.displayName}`
      );
    }
    if (account.organizationRole) {
      requireCondition(
        user.organizationMemberships.some((membership) => membership.role === account.organizationRole),
        `Missing ${account.organizationRole} membership for ${account.displayName}`
      );
    }
  }
  requireCondition(
    customers.every((user) => user._count.tickets > 0),
    "Every demo customer must have at least one ticket"
  );

  const statusCounts = await prisma.ticket.groupBy({
    by: ["lifecycleStatus"],
    _count: { _all: true },
  });
  const statuses = new Map(
    statusCounts.map((row) => [row.lifecycleStatus, row._count._all])
  );
  for (const status of REQUIRED_TICKET_STATUSES) {
    requireCondition((statuses.get(status) ?? 0) > 0, `Missing ticket status: ${status}`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      staff: staff.length,
      customers: customers.length,
      passwordsVerified: users.length,
      customersWithTickets: customers.filter((user) => user._count.tickets > 0).length,
      staffWithOwnedTickets: staff.filter(
        (user) => user._count.ownedTickets > 0
      ).length,
      staffWithReportingAccess: staff.filter((user) =>
        user.roleAssignments.some(
          (assignment) => ["SUPPORT_MANAGER", "SUPERVISOR", "AUDITOR", "REPORTING_EXPORTER"].includes(assignment.role.key)
        )
      ).length,
      ticketStatuses: Object.fromEntries(statuses),
    })
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        event: "demo_accounts_verification_failed",
        errorType: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : "Unknown error",
      })
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
