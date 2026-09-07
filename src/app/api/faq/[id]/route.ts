import { NextResponse } from "next/server";
import { getFaqById, updateFaq, deleteFaq } from "@/lib/faq-service";
import { errors } from "@/lib/strings";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const faq = await getFaqById(parseInt(id));

    if (!faq) {
      return NextResponse.json(
        { error: errors.FAQ_NOT_FOUND },
        { status: 404 }
      );
    }

    return NextResponse.json(faq);
  } catch (error) {
    return NextResponse.json(
      { error: errors.FETCH_FAQ },
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
    const updated = await updateFaq(parseInt(id), body);
    return NextResponse.json(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : errors.UPDATE_FAQ;
    const status = message.includes("یافت نشد") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteFaq(parseInt(id));
    return NextResponse.json({ message: "پرسش و پاسخ با موفقیت حذف شد" });
  } catch (error) {
    return NextResponse.json(
      { error: errors.DELETE_FAQ },
      { status: 500 }
    );
  }
}
