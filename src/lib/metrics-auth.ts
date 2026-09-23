import { createHash, timingSafeEqual } from "node:crypto";
import { getMetricsToken } from "@/lib/observability-config";

export function hasValidMetricsToken(request: Request): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const suppliedDigest = createHash("sha256")
    .update(authorization.slice("Bearer ".length))
    .digest();
  const expectedDigest = createHash("sha256").update(getMetricsToken()).digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}
