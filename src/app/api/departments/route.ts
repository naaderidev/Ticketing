import { apiJsonResponse } from "@/lib/api-date-contract";
import { getDepartments, createDepartment } from "@/lib/department-service";
import { errors } from "@/lib/strings";
import { departmentSchema } from "@/lib/validations";
import { requireAuthenticatedUser, requireGlobalPermission } from "@/lib/api-authorization";
import { handleApiError, parseJsonBody } from "@/lib/api-validation";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";

export async function GET() {
  try {
    const auth = await requireAuthenticatedUser();
    if (!auth.authorized) return auth.response;

    const departments = await getDepartments();
    return apiJsonResponse(departments);
  } catch (error) {
    return handleApiError(error, errors.FETCH_DEPARTMENTS, "Error fetching departments");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireGlobalPermission("support.catalog.manage", { rateLimit: AUTHENTICATED_MUTATION_LIMIT });
    if (!auth.authorized) return auth.response;

    const body = await parseJsonBody(request, departmentSchema);
    if (!body.success) return body.response;
    const department = await createDepartment(body.data.name);
    return apiJsonResponse(department, { status: 201 });
  } catch (error) {
    return handleApiError(error, errors.CREATE_DEPARTMENT, "Error creating department");
  }
}
