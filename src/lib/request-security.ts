import { createHmac, randomUUID } from "crypto";
import { isIP } from "net";
import {
  getSecurityHashSecret,
  getTrustedProxyIpHeader,
} from "@/lib/security-config";

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const generatedRequestIds = new WeakMap<Request, string>();

export function hashSecurityValue(namespace: string, value: string): string {
  return createHmac("sha256", getSecurityHashSecret())
    .update(`${namespace}:${value}`)
    .digest("hex");
}

function normalizeForwardedIp(value: string): string | null {
  const candidate = value.split(",")[0]?.trim();
  if (!candidate || candidate.length > 64 || isIP(candidate) === 0) return null;
  return candidate;
}

export function getRequestSourceHash(request: Request): string {
  const trustedHeader = getTrustedProxyIpHeader();
  if (!trustedHeader) return hashSecurityValue("source", "unavailable");

  const ip = normalizeForwardedIp(request.headers.get(trustedHeader) ?? "");
  return hashSecurityValue("source", ip ?? "invalid");
}

export function getRequestId(request: Request): string {
  const provided = request.headers.get("x-request-id")?.trim();
  if (provided && REQUEST_ID_PATTERN.test(provided)) return provided;
  const existing = generatedRequestIds.get(request);
  if (existing) return existing;
  const generated = randomUUID();
  generatedRequestIds.set(request, generated);
  return generated;
}
