import { apiJsonResponse } from "@/lib/api-date-contract";
import {
  getSubDepartments,
  createSubDepartment,
} from "@/lib/department-service";
import { errors } from "@/lib/strings";
import { subDepartmentSchema } from "@/lib/validations";
import { requireAuthenticatedUser, requireGlobalPermission } from "@/lib/api-authorization";
import { handleApiError, parseJsonBody, parsePositiveInteger } from "@/lib/api-validation";
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
    const subDepartments = await getSubDepartments(parsedId.data);
    return apiJsonResponse(subDepartments);
  } catch (error) {
    return handleApiError(error, errors.FETCH_SUB_DEPARTMENTS, "Error fetching sub-departments");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireGlobalPermission("support.catalog.manage", { rateLimit: AUTHENTICATED_MUTATION_LIMIT });
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const parsedId = parsePositiveInteger(id, "شناسه دپارتمان");
    if (!parsedId.success) return parsedId.response;
    const body = await parseJsonBody(request, subDepartmentSchema);
    if (!body.success) return body.response;
    const subDepartment = await createSubDepartment(parsedId.data, body.data.name);
    return apiJsonResponse(subDepartment, { status: 201 });
  } catch (error) {
    return handleApiError(error, errors.CREATE_SUB_DEPARTMENT, "Error creating sub-department");
  }
}
