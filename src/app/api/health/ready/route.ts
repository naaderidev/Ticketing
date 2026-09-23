import { apiJsonResponse } from "@/lib/api-date-contract";
import { checkReadiness } from "@/lib/health-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const result = await checkReadiness(request.url);

  return apiJsonResponse(
    { status: result.ready ? "ready" : "unavailable" },
    {
      status: result.ready ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
