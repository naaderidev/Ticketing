import { apiError } from "@/lib/api-validation";
import { hasValidMetricsToken } from "@/lib/metrics-auth";
import { collectRuntimeMetrics } from "@/lib/runtime-metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  if (!hasValidMetricsToken(request)) {
    return apiError("احراز هویت الزامی است", 401, "UNAUTHORIZED");
  }

  return new Response(await collectRuntimeMetrics(request.url), {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    },
  });
}
