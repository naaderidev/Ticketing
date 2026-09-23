import { createHash, timingSafeEqual } from "node:crypto";
import { getAttachmentCleanupToken } from "@/lib/attachment-config";

export function hasValidAttachmentMaintenanceToken(request: Request): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const suppliedDigest = createHash("sha256")
    .update(authorization.slice("Bearer ".length))
    .digest();
  const expectedDigest = createHash("sha256")
    .update(getAttachmentCleanupToken())
    .digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}
