import { apiJsonResponse } from "@/lib/api-date-contract";
import {
  getSubDepartmentById,
  updateSubDepartment,
  deleteSubDepartment,
} from "@/lib/department-service";
import { errors } from "@/lib/strings";
import { subDepartmentSchema } from "@/lib/validations";
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
    const parsedId = parsePositiveInteger(id, "شناسه ساب‌دپارتمان");
    if (!parsedId.success) return parsedId.response;
    const subDepartment = await getSubDepartmentById(parsedId.data);

    if (!subDepartment) {
      return apiError(errors.SUB_DEPARTMENT_NOT_FOUND, 404, "NOT_FOUND");
    }

    return apiJsonResponse(subDepartment);
  } catch (error) {
    return handleApiError(error, errors.FETCH_SUB_DEPARTMENT, "Error fetching sub-department");
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
    const parsedId = parsePositiveInteger(id, "شناسه ساب‌دپارتمان");
    if (!parsedId.success) return parsedId.response;
    const body = await parseJsonBody(request, subDepartmentSchema);
    if (!body.success) return body.response;
    const updated = await updateSubDepartment(parsedId.data, body.data.name);
    return apiJsonResponse(updated);
  } catch (error) {
    return handleApiError(error, errors.UPDATE_SUB_DEPARTMENT, "Error updating sub-department");
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
    const parsedId = parsePositiveInteger(id, "شناسه ساب‌دپارتمان");
    if (!parsedId.success) return parsedId.response;
    await deleteSubDepartment(parsedId.data);
    return apiJsonResponse({ message: "ساب‌دپارتمان با موفقیت حذف شد" });
  } catch (error) {
    return handleApiError(error, errors.DELETE_SUB_DEPARTMENT, "Error deleting sub-department");
  }
}
