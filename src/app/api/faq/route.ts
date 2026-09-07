import { NextResponse } from "next/server";
import { getFaqs, createFaq } from "@/lib/faq-service";
import { errors } from "@/lib/strings";
import { faqSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const faqs = await getFaqs({
      departmentId: searchParams.get("departmentId") || undefined,
      subDepartmentId: searchParams.get("subDepartmentId") || undefined,
    });

    return NextResponse.json(faqs);
  } catch (error) {
    console.error("Error fetching FAQs:", error);
    return NextResponse.json(
      { error: errors.FETCH_FAQS },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = faqSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.issues[0]?.message || "داده‌های ورودی معتبر نیستند";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }
    const faq = await createFaq(result.data);
    return NextResponse.json(faq, { status: 201 });
  } catch (error) {
    console.error("Error creating FAQ:", error);
    const message =
      error instanceof Error ? error.message : errors.CREATE_FAQ;
    const status = message.includes("الزامی")
      ? 400
      : message.includes("یافت نشد")
        ? 404
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
