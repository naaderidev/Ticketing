import { apiJsonResponse } from "@/lib/api-date-contract";
import { requireAuthenticatedUser } from "@/lib/api-authorization";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/api-validation";
import { getFrontendAccessProfile } from "@/lib/frontend-access";

export async function GET() {
  try {
    const auth = await requireAuthenticatedUser();
    if (!auth.authorized) return auth.response;

    const user = await prisma.user.findUnique({
      where: { id: auth.value.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        mobile: true,
        email: true,
        birthday: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return apiError("کاربر یافت نشد", 404, "NOT_FOUND");
    }

    const access = await getFrontendAccessProfile(user.id);
    return apiJsonResponse({
      ...user,
      access: {
        roleLabels:
          access.roleLabels.length > 0 ? access.roleLabels : ["کاربر فردی"],
        staffRoleKeys: access.staffRoleKeys,
        organizationRoleKeys: access.organizationRoleKeys,
      },
    });
  } catch (error) {
    return handleApiError(error, "خطا در دریافت اطلاعات کاربر", "Error fetching current user");
  }
}
