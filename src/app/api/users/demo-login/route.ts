import { z } from "zod";
import { apiJsonResponse } from "@/lib/api-date-contract";
import { createAuthSession, revokeCurrentSession } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  apiError,
  handleApiError,
  parseJsonBody,
  rateLimitError,
} from "@/lib/api-validation";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestSourceHash } from "@/lib/request-security";
import { findUserByMobile } from "@/lib/user-service";
import { prisma } from "@/lib/prisma";
import demoAccounts from "@/config/demo-accounts.json";
import { isDemoMode } from "@/lib/demo-mode";

const demoLoginSchema = z
  .object({
    accountKey: z.string().trim().min(3).max(64).regex(/^[a-z0-9-]+$/),
  })
  .strict();

const DEMO_LOGIN_LIMIT = {
  scope: "demo-login-source",
  limit: isDemoMode() ? 10_000 : 30,
  windowSeconds: 5 * 60,
};

function matchesSeededAccount(
  user: NonNullable<Awaited<ReturnType<typeof findUserByMobile>>>,
  account: (typeof demoAccounts)[number],
): boolean {
  return (
    user.firstName === account.firstName &&
      user.lastName === account.lastName &&
      user.email === account.email &&
      user.role === account.role
  );
}

async function matchesConfiguredPersona(
  userId: number,
  account: (typeof demoAccounts)[number],
): Promise<boolean> {
  if ("staffRoleKey" in account && account.staffRoleKey) {
    const assignment = await prisma.userRoleAssignment.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        role: { key: account.staffRoleKey },
      },
      select: { id: true },
    });
    return assignment !== null;
  }

  if ("organizationRole" in account && account.organizationRole) {
    const organizationRole =
      account.organizationRole === "MANAGER" ? "MANAGER" : "REPRESENTATIVE";
    const membership = await prisma.organizationMembership.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        role: organizationRole,
      },
      select: { id: true },
    });
    return membership !== null;
  }

  const organizationMembership = await prisma.organizationMembership.findFirst({
    where: { userId, status: "ACTIVE" },
    select: { id: true },
  });
  return organizationMembership === null;
}

export async function POST(request: Request) {
  try {
    const sourceLimit = await consumeRateLimit(
      DEMO_LOGIN_LIMIT,
      `source:${getRequestSourceHash(request)}`,
    );
    if (!sourceLimit.allowed) {
      await recordAuditEvent({
        request,
        action: "AUTH_DEMO_LOGIN",
        outcome: "DENIED",
        metadata: { reason: "source_rate_limit" },
      });
      return rateLimitError(sourceLimit.retryAfterSeconds);
    }

    const body = await parseJsonBody(request, demoLoginSchema);
    if (!body.success) return body.response;

    const account = demoAccounts.find(
      (candidate) => candidate.key === body.data.accountKey,
    );
    if (!account) {
      await recordAuditEvent({
        request,
        action: "AUTH_DEMO_LOGIN",
        outcome: "DENIED",
        metadata: { reason: "unknown_demo_account" },
      });
      return apiError("حساب دمو یافت نشد", 404, "NOT_FOUND");
    }

    const user = await findUserByMobile(account.mobile);
    if (
      !user ||
      !matchesSeededAccount(user, account) ||
      !(await matchesConfiguredPersona(user.id, account))
    ) {
      await recordAuditEvent({
        request,
        action: "AUTH_DEMO_LOGIN",
        outcome: "DENIED",
        metadata: { reason: "demo_account_not_seeded", accountKey: account.key },
      });
      return apiError(
        "حساب دمو هنوز آماده نشده است؛ داده‌های نمایشی را دوباره Seed کنید",
        404,
        "NOT_FOUND",
      );
    }

    await revokeCurrentSession();
    const sessionId = await createAuthSession(user.id);
    const redirectTo = account.redirectTo;

    await recordAuditEvent({
      request,
      action: "AUTH_DEMO_LOGIN",
      outcome: "SUCCESS",
      actorUserId: user.id,
      sessionId,
      metadata: { accountKey: account.key },
    });

    return apiJsonResponse(
      {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        redirectTo,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    await recordAuditEvent({
      request,
      action: "AUTH_DEMO_LOGIN",
      outcome: "FAILURE",
    });
    return handleApiError(error, "ورود به حساب دمو ناموفق بود", "Demo account login");
  }
}
