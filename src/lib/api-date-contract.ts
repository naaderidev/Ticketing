import { NextResponse } from "next/server";
import { toJalaliApiPayload } from "@/lib/jalali-date";

export function apiJsonResponse(
  body: unknown,
  init?: ResponseInit
): NextResponse {
  return NextResponse.json(toJalaliApiPayload(body), init);
}
