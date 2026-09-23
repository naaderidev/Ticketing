import { apiJsonResponse } from "@/lib/api-date-contract";
import { getUsers, createUser, updateUserRole } from "@/lib/user-service";
import { errors } from "@/lib/strings";
import { createUserSchema, updateUserRoleSchema } from "@/lib/validations";
import { requireActiveRole } from "@/lib/api-authorization";
import { handleApiError, parseJsonBody } from "@/lib/api-validation";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { recordAuditEvent } from "@/lib/audit-log";

export async function GET() {
  try {
    const auth = await requireActiveRole("SYSTEM_ADMINISTRATOR");
    if (!auth.authorized) return auth.response;

    const users = await getUsers();
    return apiJsonResponse(users);
  } catch (error) {
    return handleApiError(error, errors.FETCH_USERS, "Error fetching users");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireActiveRole("SYSTEM_ADMINISTRATOR", {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;

    const body = await parseJsonBody(request, createUserSchema);
    if (!body.success) return body.response;
    const user = await createUser({
      firstName: body.data.firstName,
      lastName: body.data.lastName,
      nationalCode: body.data.nationalCode,
      mobile: body.data.mobile,
      password: body.data.password,
      email: body.data.email,
      birthday: body.data.birthday,
    });
    await recordAuditEvent({
      request,
      action: "ADMIN_USER_CREATE",
      outcome: "SUCCESS",
      actorUserId: auth.value.id,
      sessionId: auth.value.sessionId,
      targetType: "USER",
      targetId: String(user.id),
    });
    return apiJsonResponse(user, { status: 201 });
  } catch (error) {
    return handleApiError(error, errors.CREATE_USER, "Error creating user");
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireActiveRole("SYSTEM_ADMINISTRATOR", {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;

    const body = await parseJsonBody(request, updateUserRoleSchema);
    if (!body.success) return body.response;
    const updatedUser = await updateUserRole(body.data.userId, body.data.role);
    await recordAuditEvent({
      request,
      action: "ADMIN_USER_ROLE_UPDATE",
      outcome: "SUCCESS",
      actorUserId: auth.value.id,
      sessionId: auth.value.sessionId,
      targetType: "USER",
      targetId: String(updatedUser.id),
      metadata: { role: updatedUser.role },
    });
    return apiJsonResponse(updatedUser);
  } catch (error) {
    return handleApiError(error, "خطا در بروزرسانی نقش کاربر", "Error updating user role");
  }
}
