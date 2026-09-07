import { NextResponse } from "next/server";
import { getTickets, createTicket } from "@/lib/ticket-service";
import { errors } from "@/lib/strings";
import { createTicketSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const result = await getTickets({
      search: searchParams.get("search") || undefined,
      status: searchParams.get("status") || undefined,
      departmentId: searchParams.get("departmentId") || undefined,
      subDepartmentId: searchParams.get("subDepartmentId") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      userName: searchParams.get("userName") || undefined,
      userId: searchParams.get("userId") || undefined,
      page: parseInt(searchParams.get("page") || "1"),
      limit: parseInt(searchParams.get("limit") || "10"),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching tickets:", error);
    return NextResponse.json(
      { error: errors.FETCH_TICKETS },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const result = createTicketSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.issues[0]?.message || "داده‌های ورودی معتبر نیستند";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const ticket = await createTicket(body);
    return NextResponse.json(ticket, { status: 201 });
  } catch (error) {
    console.error("Error creating ticket:", error);
    const message =
      error instanceof Error ? error.message : errors.CREATE_TICKET;
    const status = message.includes(errors.TICKET_NOT_FOUND.split(" ").pop() || "یافت نشد")
      ? 404
      : message.includes(errors.ALL_FIELDS_REQUIRED.split(" ").pop() || "الزامی") || message.includes(errors.SUB_DEPARTMENT_DEPARTMENT_MISMATCH.split(" ").pop() || "نیست")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
