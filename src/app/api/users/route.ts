import { NextResponse } from "next/server";
import { getUsers, createUser, updateUserRole } from "@/lib/user-service";
import { errors } from "@/lib/strings";
import { createUserSchema } from "@/lib/validations";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json(
        { error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    if (authUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "دسترسی غیرمجاز" },
        { status: 403 }
      );
    }

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
    const { confirmPassword: _, ...userData } = result.data;
    const user = await createUser(userData);
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

export async function PATCH(request: Request) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json(
        { error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    if (authUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "دسترسی غیرمجاز" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { userId, role } = body;

    if (!userId || !role) {
      return NextResponse.json(
        { error: "userId و role الزامی است" },
        { status: 400 }
      );
    }

    if (role !== "USER" && role !== "ADMIN") {
      return NextResponse.json(
        { error: "نقش معتبر نیست" },
        { status: 400 }
      );
    }

    const updatedUser = await updateUserRole(Number(userId), role);
    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Error updating user role:", error);
    const message =
      error instanceof Error ? error.message : "خطا در بروزرسانی نقش کاربر";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
