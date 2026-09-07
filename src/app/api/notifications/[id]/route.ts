import { NextResponse } from "next/server";
import { markAsRead } from "@/lib/notification-service";
import { errors } from "@/lib/strings";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const notification = await markAsRead(parseInt(id));
    return NextResponse.json(notification);
  } catch (error) {
    return NextResponse.json(
      { error: errors.UPDATE_NOTIFICATION },
      { status: 500 }
    );
  }
}
