import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addReply } from "@/lib/ticket-service";
import { errors } from "@/lib/strings";
import { replySchema } from "@/lib/validations";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params;

    const ticket = await prisma.ticket.findUnique({
      where: { ticketId },
    });

    if (!ticket) {
      return NextResponse.json({ error: errors.TICKET_NOT_FOUND }, { status: 404 });
    }

    const replies = await prisma.ticketReply.findMany({
      where: { ticketId: ticket.id },
      include: { attachments: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(replies);
  } catch (error) {
    return NextResponse.json(
      { error: errors.FETCH_REPLIES },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params;
    const body = await request.json();
    const result = replySchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.issues[0]?.message || "داده‌های ورودی معتبر نیستند";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }
    const reply = await addReply(ticketId, body);
    return NextResponse.json(reply, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : errors.CREATE_REPLY;
    const status = message.includes("یافت نشد")
      ? 404
      : message.includes("الزامی") ||
          message.includes("نامعتبر") ||
          message.includes("بسته شده")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
