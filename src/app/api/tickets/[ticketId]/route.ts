import { NextResponse } from "next/server";
import {
  getTicketByTicketId,
  updateTicket,
  deleteTicket,
} from "@/lib/ticket-service";
import { errors } from "@/lib/strings";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params;
    const ticket = await getTicketByTicketId(ticketId);

    if (!ticket) {
      return NextResponse.json({ error: errors.TICKET_NOT_FOUND }, { status: 404 });
    }

    return NextResponse.json(ticket);
  } catch (error) {
    return NextResponse.json(
      { error: errors.FETCH_TICKET },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params;
    const body = await request.json();
    const updated = await updateTicket(ticketId, body);
    return NextResponse.json(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : errors.UPDATE_TICKET;
    const status = message.includes(errors.TICKET_NOT_FOUND.split(" ").pop() || "یافت نشد")
      ? 404
      : message.includes(errors.ALL_FIELDS_REQUIRED.split(" ").pop() || "الزامی")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params;
    await deleteTicket(ticketId);
    return NextResponse.json({ message: "تیکت با موفقیت حذف شد" });
  } catch (error) {
    return NextResponse.json({ error: errors.DELETE_TICKET }, { status: 500 });
  }
}
