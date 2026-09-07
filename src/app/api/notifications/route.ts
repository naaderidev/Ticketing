import { NextResponse } from "next/server";
import { getNotifications } from "@/lib/notification-service";
import { errors } from "@/lib/strings";
import { getAuthUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json(
        { error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);

    const result = await getNotifications({
      recipientType: searchParams.get("recipientType") || undefined,
      unreadOnly: searchParams.get("unreadOnly") || undefined,
      userId: authUser.role === "ADMIN"
        ? searchParams.get("userId") || undefined
        : authUser.id.toString(),
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
