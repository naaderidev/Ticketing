import { NextResponse } from "next/server";
import {
  getSubDepartments,
  createSubDepartment,
} from "@/lib/department-service";
import { errors } from "@/lib/strings";
import { subDepartmentSchema } from "@/lib/validations";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const subDepartments = await getSubDepartments(parseInt(id));
    return NextResponse.json(subDepartments);
  } catch (error) {
    return NextResponse.json(
      { error: errors.FETCH_SUB_DEPARTMENTS },
      { status: 500 }
    );
  }
}

export async function POST(
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
    const subDepartment = await createSubDepartment(parseInt(id), result.data.name);
    return NextResponse.json(subDepartment, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : errors.CREATE_SUB_DEPARTMENT;
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
