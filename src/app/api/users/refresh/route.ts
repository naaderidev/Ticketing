import { NextResponse } from "next/server";
import { refreshTokenIfNeeded } from "@/lib/auth";
import { cookies } from "next/headers";

const COOKIE_NAME = "auth-token";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json(
        { error: "توکن یافت نشد" },
        { status: 401 }
      );
    }

    const newToken = await refreshTokenIfNeeded(token);

    if (newToken) {
      cookieStore.set(COOKIE_NAME, newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });
      return NextResponse.json({ refreshed: true });
    }

    return NextResponse.json({ refreshed: false });
  } catch {
    return NextResponse.json(
      { error: "خطا در بروزرسانی توکن" },
      { status: 500 }
    );
  }
}
