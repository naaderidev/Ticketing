import { createHash, timingSafeEqual } from "node:crypto";
import { getSlaRoutingConfig } from "@/lib/sla-routing-config";

export function hasValidSlaMaintenanceToken(request: Request): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const supplied = createHash("sha256")
    .update(authorization.slice("Bearer ".length))
    .digest();
  const expected = createHash("sha256")
    .update(getSlaRoutingConfig().maintenanceToken)
    .digest();
  return timingSafeEqual(supplied, expected);
}
