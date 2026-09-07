import { NextResponse } from "next/server";
import { reorderFaqs } from "@/lib/faq-service";
import { errors } from "@/lib/strings";

export async function PUT(request: Request) {
  try {
    const { items } = await request.json();
    await reorderFaqs(items);
    return NextResponse.json({
      message: "اولویت‌ها با موفقیت بروزرسانی شدند",
    });
  } catch (error) {
    return NextResponse.json(
      { error: errors.REORDER_FAQS },
      { status: 500 }
    );
  }
}
