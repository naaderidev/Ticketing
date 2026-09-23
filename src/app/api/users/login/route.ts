import { apiJsonResponse } from "@/lib/api-date-contract";
import { findUserByMobile } from "@/lib/user-service";
import { errors } from "@/lib/strings";
import { loginSchema } from "@/lib/validations";
import { createAuthSession, verifyPassword } from "@/lib/auth";
import {
  apiError,
  handleApiError,
  parseJsonBody,
  rateLimitError,
} from "@/lib/api-validation";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestSourceHash } from "@/lib/request-security";
import { recordAuditEvent } from "@/lib/audit-log";
import { isDemoMode } from "@/lib/demo-mode";

const DUMMY_PASSWORD_HASH =
  "$2b$12$SP9PjPKTdiLJzRwidwlamerYgoovVRNPAcE5qRr.MQxNZ7adwIYXq";
const INVALID_CREDENTIALS_MESSAGE = "شماره موبایل یا رمز عبور صحیح نیست";
const LOGIN_SOURCE_LIMIT = {
  scope: "login-source",
  limit: isDemoMode() ? 10_000 : 10,
  windowSeconds: 15 * 60,
};
const LOGIN_IDENTITY_LIMIT = {
  scope: "login-identity",
  limit: isDemoMode() ? 10_000 : 5,
  windowSeconds: 15 * 60,
};

export async function POST(request: Request) {
  try {
    const sourceLimit = await consumeRateLimit(
      LOGIN_SOURCE_LIMIT,
      `source:${getRequestSourceHash(request)}`
    );
    if (!sourceLimit.allowed) {
      await recordAuditEvent({
        request,
        action: "AUTH_LOGIN",
        outcome: "DENIED",
        metadata: { reason: "source_rate_limit" },
      });
      return rateLimitError(sourceLimit.retryAfterSeconds);
    }

    const body = await parseJsonBody(request, loginSchema);
    if (!body.success) return body.response;

    const identityLimit = await consumeRateLimit(
      LOGIN_IDENTITY_LIMIT,
      `mobile:${body.data.mobile}`
    );
    if (!identityLimit.allowed) {
      await recordAuditEvent({
        request,
        action: "AUTH_LOGIN",
        outcome: "DENIED",
        metadata: { reason: "identity_rate_limit" },
      });
      return rateLimitError(identityLimit.retryAfterSeconds);
    }

    const user = await findUserByMobile(body.data.mobile);

    const isValidPassword = await verifyPassword(
      body.data.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH
    );
    if (!user || !isValidPassword) {
      await recordAuditEvent({
        request,
        action: "AUTH_LOGIN",
        outcome: "DENIED",
        metadata: { reason: "invalid_credentials" },
      });
      return apiError(INVALID_CREDENTIALS_MESSAGE, 401, "UNAUTHORIZED");
    }

    const sessionId = await createAuthSession(user.id);
    await recordAuditEvent({
      request,
      action: "AUTH_LOGIN",
      outcome: "SUCCESS",
      actorUserId: user.id,
      sessionId,
    });

    return apiJsonResponse({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      mobile: user.mobile,
      role: user.role,
    });
  } catch (error) {
    await recordAuditEvent({
      request,
      action: "AUTH_LOGIN",
      outcome: "FAILURE",
    });
    return handleApiError(error, errors.LOGIN, "Error logging in");
  }
}
