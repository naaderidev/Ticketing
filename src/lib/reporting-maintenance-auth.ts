import { createHash, timingSafeEqual } from "node:crypto";
import { getReportingConfig } from "@/lib/reporting-config";

export function hasValidReportingMaintenanceToken(request: Request): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const supplied = createHash("sha256")
    .update(authorization.slice("Bearer ".length))
    .digest();
  const expected = createHash("sha256")
    .update(getReportingConfig().maintenanceToken)
    .digest();
  return timingSafeEqual(supplied, expected);
}
