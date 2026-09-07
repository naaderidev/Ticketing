import { NextResponse } from "next/server";
import {
  getSubDepartmentById,
  updateSubDepartment,
  deleteSubDepartment,
} from "@/lib/department-service";
import { errors } from "@/lib/strings";
import { subDepartmentSchema } from "@/lib/validations";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const subDepartment = await getSubDepartmentById(parseInt(id));

    if (!subDepartment) {
      return NextResponse.json(
        { error: errors.SUB_DEPARTMENT_NOT_FOUND },
        { status: 404 }
      );
    }

    return NextResponse.json(subDepartment);
  } catch (error) {
    return NextResponse.json(
      { error: errors.FETCH_SUB_DEPARTMENT },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const result = subDepartmentSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.issues[0]?.message || "داده‌های ورودی معتبر نیستند";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }
    const updated = await updateSubDepartment(parseInt(id), result.data.name);
    return NextResponse.json(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : errors.UPDATE_SUB_DEPARTMENT;
    const status = message.includes("الزامی")
      ? 400
      : message.includes("یافت نشد")
        ? 404
        : message.includes("قبلاً")
          ? 409
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteSubDepartment(parseInt(id));
    return NextResponse.json({ message: "ساب‌دپارتمان با موفقیت حذف شد" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : errors.DELETE_SUB_DEPARTMENT;
    const status = message.includes("وجود ندارد") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
