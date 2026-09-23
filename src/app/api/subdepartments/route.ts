import { apiJsonResponse } from "@/lib/api-date-contract";
import { getAllSubDepartments } from "@/lib/department-service";
import { errors } from "@/lib/strings";
import { requireAuthenticatedUser } from "@/lib/api-authorization";
import { handleApiError } from "@/lib/api-validation";

export async function GET() {
  try {
    const auth = await requireAuthenticatedUser();
    if (!auth.authorized) return auth.response;

    const subDepartments = await getAllSubDepartments();
    return apiJsonResponse(subDepartments);
  } catch (error) {
    return handleApiError(error, errors.FETCH_SUB_DEPARTMENTS, "Error fetching sub-departments");
  }
}
