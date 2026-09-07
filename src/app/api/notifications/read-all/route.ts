import { NextResponse } from "next/server";
import { markAllAsRead } from "@/lib/notification-service";
import { errors } from "@/lib/strings";

export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    await markAllAsRead({
      recipientType: searchParams.get("recipientType") || undefined,
      userId: searchParams.get("userId") || undefined,
    });

    return NextResponse.json({ message: "تمام نوتیفیکیشن‌ها خوانده شدند" });
  } catch (error) {
    return NextResponse.json(
      { error: errors.UPDATE_NOTIFICATIONS },
      { status: 500 }
    );
  }
}
