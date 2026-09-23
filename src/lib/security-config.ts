import { isDemoMode } from "@/lib/demo-mode";

const MINIMUM_JWT_SECRET_LENGTH = 32;
const UNSAFE_JWT_SECRETS = new Set([
  "your-secret-key-change-in-production",
  "replace_with_a_cryptographically_random_secret",
  "replace-with-a-cryptographically-random-secret",
]);
const ALLOWED_PROXY_IP_HEADERS = new Set([
  "cf-connecting-ip",
  "x-forwarded-for",
  "x-real-ip",
]);

let encodedJwtSecret: Uint8Array | undefined;
let securityHashSecret: string | undefined;

export function getJwtSecret(): Uint8Array {
  if (encodedJwtSecret) return encodedJwtSecret;

  const secret = process.env.JWT_SECRET?.trim();

  if (
    !secret ||
    secret.length < MINIMUM_JWT_SECRET_LENGTH ||
    UNSAFE_JWT_SECRETS.has(secret)
  ) {
    throw new Error(
      "JWT_SECRET must be configured with at least 32 non-placeholder characters"
    );
  }

  encodedJwtSecret = new TextEncoder().encode(secret);
  return encodedJwtSecret;
}

export function getSecurityHashSecret(): string {
  if (securityHashSecret) return securityHashSecret;

  const secret = process.env.SECURITY_HASH_SECRET?.trim();
  if (!secret || secret.length < 32 || secret.startsWith("replace_")) {
    throw new Error(
      "SECURITY_HASH_SECRET must be configured with at least 32 non-placeholder characters"
    );
  }

  securityHashSecret = secret;
  return securityHashSecret;
}

export function getApplicationOrigin(requestUrl: string): string | null {
  const configuredOrigin = process.env.APP_ORIGIN?.trim();
  if (configuredOrigin) {
    try {
      const parsed = new URL(configuredOrigin);
      if (parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
      if (
        process.env.NODE_ENV === "production" &&
        !isDemoMode() &&
        parsed.protocol !== "https:"
      ) {
        return null;
      }
      return parsed.origin;
    } catch {
      return null;
    }
  }

  if (process.env.NODE_ENV === "production" && !isDemoMode()) return null;
  return new URL(requestUrl).origin;
}

export function getTrustedProxyIpHeader(): string | null {
  const header = process.env.TRUSTED_PROXY_IP_HEADER?.trim().toLowerCase();
  if (!header) {
    if (process.env.NODE_ENV === "production" && !isDemoMode()) {
      throw new Error("TRUSTED_PROXY_IP_HEADER must be configured in production");
    }
    return null;
  }

  if (!ALLOWED_PROXY_IP_HEADERS.has(header)) {
    throw new Error("TRUSTED_PROXY_IP_HEADER is not supported");
  }
  return header;
}

export function resetSecurityConfigForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Security configuration can only be reset in tests");
  }

  encodedJwtSecret = undefined;
  securityHashSecret = undefined;
}
