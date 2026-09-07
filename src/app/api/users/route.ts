import { NextResponse } from "next/server";
import { getUsers, createUser } from "@/lib/user-service";
import { errors } from "@/lib/strings";
import { createUserSchema } from "@/lib/validations";

export async function GET() {
  try {
    const users = await getUsers();
    return NextResponse.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: errors.FETCH_USERS },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = createUserSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.issues[0]?.message || "داده‌های ورودی معتبر نیستند";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }
    const user = await createUser(result.data);
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("Error creating user:", error);
    const message =
      error instanceof Error ? error.message : errors.CREATE_USER;
    const status = message.includes("الزامی")
      ? 400
      : message.includes("قبلاً")
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
