import { NextResponse } from "next/server";
import { getMessages, createMessage } from "@/lib/message-service";
import { errors } from "@/lib/strings";
import { predefinedMessageSchema } from "@/lib/validations";

export async function GET() {
  try {
    const messages = await getMessages();
    return NextResponse.json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json(
      { error: errors.FETCH_MESSAGES },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = predefinedMessageSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.issues[0]?.message || "داده‌های ورودی معتبر نیستند";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }
    const message = await createMessage(result.data);
    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("Error creating message:", error);
    const message =
      error instanceof Error ? error.message : errors.CREATE_MESSAGE;
    const status = message.includes("الزامی")
      ? 400
      : message.includes("قبلاً")
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
