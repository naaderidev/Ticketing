import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CurrentUser, getCurrentUser } from "@/lib/current-user";
import {
  hasNotificationPermission,
  hasTicketPermission,
  TicketPermission,
} from "@/lib/authorization-policy";
import { apiError, ApiErrorCode, rateLimitError } from "@/lib/api-validation";
import { consumeRateLimit, RateLimitPolicy } from "@/lib/rate-limit";

export type RequestUser = CurrentUser;

type Authorized<T> = { authorized: true; value: T };
type Denied = { authorized: false; response: NextResponse };
export type AuthorizationResult<T> = Authorized<T> | Denied;

function deny(
  message: string,
  status: 401 | 403 | 404,
  code: ApiErrorCode
): Denied {
  return {
    authorized: false,
    response: apiError(message, status, code),
  };
}

interface AuthorizationOptions {
  rateLimit?: RateLimitPolicy;
}

export async function requireAuthenticatedUser(
  options: AuthorizationOptions = {}
): Promise<
  AuthorizationResult<RequestUser>
> {
  const user = await getCurrentUser();
  if (!user) return deny("نشست کاربری معتبر نیست", 401, "UNAUTHORIZED");

  if (options.rateLimit) {
    const result = await consumeRateLimit(
      options.rateLimit,
      `user:${user.id}`
    );
    if (!result.allowed) {
      return {
        authorized: false,
        response: rateLimitError(result.retryAfterSeconds),
      };
    }
  }

  return { authorized: true, value: user };
}

export async function requireAdmin(
  options: AuthorizationOptions = {}
): Promise<
  AuthorizationResult<RequestUser>
> {
  const auth = await requireAuthenticatedUser(options);
  if (!auth.authorized) return auth;
  if (auth.value.role !== "ADMIN") {
    return deny("دسترسی غیرمجاز", 403, "FORBIDDEN");
  }
  return auth;
}

export async function requireGlobalPermission(
  permissionKey: string,
  options: AuthorizationOptions = {},
): Promise<AuthorizationResult<RequestUser>> {
  const auth = await requireAuthenticatedUser(options);
  if (!auth.authorized) return auth;

  const assignment = await prisma.userRoleAssignment.findFirst({
    where: {
      userId: auth.value.id,
      scopeType: "GLOBAL",
      scopeKey: "*",
      status: "ACTIVE",
      validFrom: { lte: new Date() },
      OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
      role: {
        permissions: { some: { permission: { key: permissionKey } } },
      },
    },
    select: { id: true },
  });
  if (!assignment) return deny("دسترسی غیرمجاز", 403, "FORBIDDEN");
  return auth;
}

export async function requireActiveRole(
  roleKey: string,
  options: AuthorizationOptions = {},
): Promise<AuthorizationResult<RequestUser>> {
  const auth = await requireAuthenticatedUser(options);
  if (!auth.authorized) return auth;

  const assignment = await prisma.userRoleAssignment.findFirst({
    where: {
      userId: auth.value.id,
      status: "ACTIVE",
      validFrom: { lte: new Date() },
      OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
      role: { key: roleKey },
    },
    select: { id: true },
  });
  if (!assignment) return deny("دسترسی غیرمجاز", 403, "FORBIDDEN");
  return auth;
}

interface AccessibleTicket {
  id: number;
  ticketId: string;
  userId: number | null;
  status: "OPEN" | "IN_PROGRESS" | "CLOSED";
}

export async function requireTicketPermission(
  ticketId: string,
  permission: TicketPermission,
  options: AuthorizationOptions = {}
): Promise<AuthorizationResult<{ user: RequestUser; ticket: AccessibleTicket }>> {
  const auth = await requireAuthenticatedUser(options);
  if (!auth.authorized) return auth;

  const ticket = await prisma.ticket.findUnique({
    where: { ticketId },
    select: { id: true, ticketId: true, userId: true, status: true },
  });

  if (!ticket) return deny("تیکت یافت نشد", 404, "NOT_FOUND");
  if (!hasTicketPermission(auth.value, ticket, permission)) {
    return deny("تیکت یافت نشد", 404, "NOT_FOUND");
  }

  return { authorized: true, value: { user: auth.value, ticket } };
}

export async function requireNotificationAccess(
  notificationId: number,
  options: AuthorizationOptions = {}
): Promise<AuthorizationResult<{ user: RequestUser }>> {
  const auth = await requireAuthenticatedUser(options);
  if (!auth.authorized) return auth;

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { userId: true, recipientType: true },
  });

  if (!notification) return deny("اعلان یافت نشد", 404, "NOT_FOUND");

  if (!hasNotificationPermission(auth.value, notification)) {
    return deny("اعلان یافت نشد", 404, "NOT_FOUND");
  }
  return { authorized: true, value: { user: auth.value } };
}
