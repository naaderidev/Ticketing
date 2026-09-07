import { NextResponse } from "next/server";
import {
  getMessageById,
  updateMessage,
  deleteMessage,
} from "@/lib/message-service";
import { errors } from "@/lib/strings";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const message = await getMessageById(parseInt(id));

    if (!message) {
      return NextResponse.json({ error: errors.MESSAGE_NOT_FOUND }, { status: 404 });
    }

    return NextResponse.json(message);
  } catch (error) {
    return NextResponse.json(
      { error: errors.FETCH_MESSAGE },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updated = await updateMessage(parseInt(id), body);
    return NextResponse.json(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : errors.UPDATE_MESSAGE;
    const status = message.includes("یافت نشد")
      ? 404
      : message.includes("الزامی")
        ? 400
        : message.includes("قبلاً")
          ? 409
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteMessage(parseInt(id));
    return NextResponse.json({ message: "پیام با موفقیت حذف شد" });
  } catch (error) {
    return NextResponse.json(      { error: errors.DELETE_MESSAGE }, { status: 500 });
  }
}
