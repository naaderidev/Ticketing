import { apiJsonResponse } from "@/lib/api-date-contract";
import { createUser } from "@/lib/user-service";
import { createUserSchema } from "@/lib/validations";
import { errors } from "@/lib/strings";
import { handleApiError, parseJsonBody, rateLimitError } from "@/lib/api-validation";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestSourceHash } from "@/lib/request-security";
import { recordAuditEvent } from "@/lib/audit-log";

const SIGNUP_SOURCE_LIMIT = {
  scope: "signup-source",
  limit: 5,
  windowSeconds: 60 * 60,
};
const SIGNUP_IDENTITY_LIMIT = {
  scope: "signup-identity",
  limit: 3,
  windowSeconds: 60 * 60,
};

export async function POST(request: Request) {
  try {
    const sourceLimit = await consumeRateLimit(
      SIGNUP_SOURCE_LIMIT,
      `source:${getRequestSourceHash(request)}`
    );
    if (!sourceLimit.allowed) {
      return rateLimitError(sourceLimit.retryAfterSeconds);
    }

    const body = await parseJsonBody(request, createUserSchema);
    if (!body.success) return body.response;

    const identityLimit = await consumeRateLimit(
      SIGNUP_IDENTITY_LIMIT,
      `signup:${body.data.mobile}:${body.data.nationalCode}`
    );
    if (!identityLimit.allowed) {
      return rateLimitError(identityLimit.retryAfterSeconds);
    }

    const user = await createUser({
      firstName: body.data.firstName,
      lastName: body.data.lastName,
      nationalCode: body.data.nationalCode,
      mobile: body.data.mobile,
      password: body.data.password,
      email: body.data.email,
      birthday: body.data.birthday,
      role: "USER",
    });
    await recordAuditEvent({
      request,
      action: "USER_SIGNUP",
      outcome: "SUCCESS",
      actorUserId: user.id,
      targetType: "USER",
      targetId: String(user.id),
    });
    return apiJsonResponse(user, { status: 201 });
  } catch (error) {
    await recordAuditEvent({
      request,
      action: "USER_SIGNUP",
      outcome: "FAILURE",
    });
    return handleApiError(error, errors.CREATE_USER, "Error signing up user");
  }
}
