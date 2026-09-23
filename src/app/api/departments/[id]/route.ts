import { apiJsonResponse } from "@/lib/api-date-contract";
import {
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
} from "@/lib/department-service";
import { errors } from "@/lib/strings";
import { departmentSchema } from "@/lib/validations";
import { requireAuthenticatedUser, requireGlobalPermission } from "@/lib/api-authorization";
import { apiError, handleApiError, parseJsonBody, parsePositiveInteger } from "@/lib/api-validation";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuthenticatedUser();
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const parsedId = parsePositiveInteger(id, "شناسه دپارتمان");
    if (!parsedId.success) return parsedId.response;
    const department = await getDepartmentById(parsedId.data);

    if (!department) {
      return apiError(errors.DEPARTMENT_NOT_FOUND, 404, "NOT_FOUND");
    }

    return apiJsonResponse(department);
  } catch (error) {
    return handleApiError(error, errors.FETCH_DEPARTMENT, "Error fetching department");
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireGlobalPermission("support.catalog.manage", { rateLimit: AUTHENTICATED_MUTATION_LIMIT });
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const parsedId = parsePositiveInteger(id, "شناسه دپارتمان");
    if (!parsedId.success) return parsedId.response;
    const body = await parseJsonBody(request, departmentSchema);
    if (!body.success) return body.response;
    const department = await updateDepartment(parsedId.data, body.data.name);
    return apiJsonResponse(department);
  } catch (error) {
    return handleApiError(error, errors.UPDATE_DEPARTMENT, "Error updating department");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireGlobalPermission("support.catalog.manage", { rateLimit: AUTHENTICATED_MUTATION_LIMIT });
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const parsedId = parsePositiveInteger(id, "شناسه دپارتمان");
    if (!parsedId.success) return parsedId.response;
    await deleteDepartment(parsedId.data);
    return apiJsonResponse({ message: "دپارتمان با موفقیت حذف شد" });
  } catch (error) {
    return handleApiError(error, errors.DELETE_DEPARTMENT, "Error deleting department");
  }
}
