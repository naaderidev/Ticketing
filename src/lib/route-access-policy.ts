const PROTECTED_PAGE_PREFIXES = ["/admin", "/user"];
const PUBLIC_USER_PAGES = new Set(["/user/login", "/user/signup"]);
const PROTECTED_API_PREFIXES = [
  "/api/v2",
  "/api/tickets",
  "/api/departments",
  "/api/subdepartments",
  "/api/faq",
  "/api/messages",
  "/api/notifications",
  "/api/upload",
  "/api/attachments",
];
const REDIRECT_BASE_URL = "https://ticketing.invalid";

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export function isProtectedPagePath(pathname: string): boolean {
  return (
    PROTECTED_PAGE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix)) &&
    !PUBLIC_USER_PAGES.has(pathname)
  );
}

export function isProtectedApiPath(pathname: string): boolean {
  return PROTECTED_API_PREFIXES.some((prefix) =>
    matchesPrefix(pathname, prefix)
  );
}

export function resolvePostLoginRedirect(
  candidate: string | null,
  fallback: "/admin" | "/user"
): string {
  if (!candidate?.startsWith("/")) return fallback;

  try {
    const parsed = new URL(candidate, REDIRECT_BASE_URL);
    if (
      parsed.origin !== REDIRECT_BASE_URL ||
      !isProtectedPagePath(parsed.pathname)
    ) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
