import { apiJsonResponse } from "@/lib/api-date-contract";
export const runtime = "nodejs";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return apiJsonResponse(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
