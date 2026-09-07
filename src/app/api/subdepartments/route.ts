import { NextResponse } from "next/server";
import { getAllSubDepartments } from "@/lib/department-service";
import { errors } from "@/lib/strings";

export async function GET() {
  try {
    const subDepartments = await getAllSubDepartments();
    return NextResponse.json(subDepartments);
  } catch (error) {
    return NextResponse.json(
      { error: errors.FETCH_SUB_DEPARTMENTS },
      { status: 500 }
    );
  }
}
