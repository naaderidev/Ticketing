import { NextResponse } from "next/server";
import { getNotifications } from "@/lib/notification-service";
import { errors } from "@/lib/strings";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const result = await getNotifications({
      recipientType: searchParams.get("recipientType") || undefined,
      unreadOnly: searchParams.get("unreadOnly") || undefined,
      userId: searchParams.get("userId") || undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { error: errors.FETCH_NOTIFICATIONS },
      { status: 500 }
    );
  }
}
