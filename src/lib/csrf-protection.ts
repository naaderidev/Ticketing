import { getApplicationOrigin } from "@/lib/security-config";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function isLocalDevelopmentSameOrigin(
  requestUrl: string,
  origin: string
): boolean {
  if (process.env.NODE_ENV === "production") return false;

  try {
    const requestOrigin = new URL(requestUrl);
    const providedOrigin = new URL(origin);

    return (
      LOOPBACK_HOSTNAMES.has(requestOrigin.hostname) &&
      requestOrigin.origin === providedOrigin.origin
    );
  } catch {
    return false;
  }
}

export function requiresCsrfProtection(method: string, pathname: string): boolean {
  return (
    UNSAFE_METHODS.has(method.toUpperCase()) &&
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/internal/")
  );
}

export function isTrustedMutationRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (!requiresCsrfProtection(request.method, url.pathname)) return true;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;

  const expectedOrigin = getApplicationOrigin(request.url);
  const origin = request.headers.get("origin");
  if (!expectedOrigin || !origin) return false;

  try {
    return (
      new URL(origin).origin === expectedOrigin ||
      isLocalDevelopmentSameOrigin(request.url, origin)
    );
  } catch {
    return false;
  }
}
