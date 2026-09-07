import { NextResponse } from "next/server";
import { getDepartments, createDepartment } from "@/lib/department-service";
import { errors } from "@/lib/strings";
import { departmentSchema } from "@/lib/validations";

export async function GET() {
  try {
    const departments = await getDepartments();
    return NextResponse.json(departments);
  } catch (error) {
    console.error("Error fetching departments:", error);
    return NextResponse.json(
      { error: errors.FETCH_DEPARTMENTS },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = departmentSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.issues[0]?.message || "داده‌های ورودی معتبر نیستند";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }
    const department = await createDepartment(result.data.name);
    return NextResponse.json(department, { status: 201 });
  } catch (error) {
    console.error("Error creating department:", error);
    const message =
      error instanceof Error ? error.message : errors.CREATE_DEPARTMENT;
    const status = message.includes("الزامی")
      ? 400
      : message.includes("قبلاً")
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
