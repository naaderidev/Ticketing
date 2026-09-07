import { NextResponse } from "next/server";
import { getUserByMobile } from "@/lib/user-service";
import { errors } from "@/lib/strings";
import { loginSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = loginSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.issues[0]?.message || "داده‌های ورودی معتبر نیستند";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }
    const user = await getUserByMobile(result.data.mobile);
    return NextResponse.json(user);
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
