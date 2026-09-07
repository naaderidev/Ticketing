import { NextResponse } from "next/server";
import {
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
} from "@/lib/department-service";
import { errors } from "@/lib/strings";
import { departmentSchema } from "@/lib/validations";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const department = await getDepartmentById(parseInt(id));

    if (!department) {
      return NextResponse.json(
        { error: errors.DEPARTMENT_NOT_FOUND },
        { status: 404 }
      );
    }

    return NextResponse.json(department);
  } catch (error) {
    return NextResponse.json(
      { error: errors.FETCH_DEPARTMENT },
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
    const result = departmentSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.issues[0]?.message || "داده‌های ورودی معتبر نیستند";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }
    const department = await updateDepartment(parseInt(id), result.data.name);
    return NextResponse.json(department);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : errors.UPDATE_DEPARTMENT;
    const status = message.includes("الزامی")
      ? 400
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
    await deleteDepartment(parseInt(id));
    return NextResponse.json({ message: "دپارتمان با موفقیت حذف شد" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : errors.DELETE_DEPARTMENT;
    const status = message.includes("وجود ندارد") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
