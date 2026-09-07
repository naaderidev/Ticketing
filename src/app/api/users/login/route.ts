import { NextResponse } from "next/server";
import { getUserByMobile } from "@/lib/user-service";
import { errors } from "@/lib/strings";
import { loginSchema } from "@/lib/validations";
import { verifyPassword, setAuthCookie } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = loginSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.issues[0]?.message || "داده‌های ورودی معتبر نیستند";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const user = await getUserByMobile(result.data.mobile);

    const isValidPassword = await verifyPassword(result.data.password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: "رمز عبور اشتباه است" },
        { status: 401 }
      );
    }

    await setAuthCookie({
      id: user.id,
      mobile: user.mobile,
      role: user.role,
    });

    return NextResponse.json({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      mobile: user.mobile,
      role: user.role,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : errors.LOGIN;
    const status = message.includes("الزامی")
      ? 400
      : message.includes("یافت نشد")
        ? 404
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
