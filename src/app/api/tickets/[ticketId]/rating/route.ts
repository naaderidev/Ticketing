import { NextResponse } from "next/server";
import { rateTicket } from "@/lib/ticket-service";
import { errors } from "@/lib/strings";
import { ratingSchema } from "@/lib/validations";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params;
    const body = await request.json();
    const result = ratingSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.issues[0]?.message || "داده‌های ورودی معتبر نیستند";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }
    const ratingResult = await rateTicket(ticketId, result.data.rating);
    return NextResponse.json(ratingResult);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : errors.CREATE_RATING;
    const status = message.includes("یافت نشد")
      ? 404
      : message.includes("الزامی") || message.includes("قبلاً")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
