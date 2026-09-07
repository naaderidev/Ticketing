import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

const COOKIE_NAME = "auth-token";

const ADMIN_ROUTES = ["/admin"];
const USER_ROUTES = ["/user"];
const PROTECTED_API_ROUTES = ["/api/tickets", "/api/departments", "/api/faq", "/api/messages", "/api/notifications", "/api/upload"];
const PUBLIC_API_ROUTES = ["/api/users/login", "/api/users/signup", "/api/users/logout", "/api/users/me"];
const ADMIN_API_ROUTES = ["/api/users"];

async function verifyAuth(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      id: payload.id as number,
      mobile: payload.mobile as string,
      role: payload.role as "USER" | "ADMIN",
    };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const user = await verifyAuth(request);

  // Check admin page routes
  if (ADMIN_ROUTES.some((route) => pathname.startsWith(route))) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/user/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
    if (user.role !== "ADMIN") {
      const url = request.nextUrl.clone();
      url.pathname = "/forbidden";
      return NextResponse.redirect(url);
    }
  }

  // Check user page routes (exclude login and signup)
  if (
    USER_ROUTES.some((route) => pathname.startsWith(route)) &&
    !pathname.includes("/user/login") &&
    !pathname.includes("/user/signup")
  ) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/user/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
  }

  // Check protected API routes
  if (PROTECTED_API_ROUTES.some((route) => pathname.startsWith(route))) {
    if (!user) {
      return NextResponse.json(
        { error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
  }

  // Check admin-only API routes (exclude public routes)
  if (
    ADMIN_API_ROUTES.some((route) => pathname.startsWith(route)) &&
    !PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route))
  ) {
    if (!user) {
      return NextResponse.json(
        { error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "دسترسی غیرمجاز" },
        { status: 403 }
      );
    }
  }

  // Add user info to headers for API routes
  if (user && pathname.startsWith("/api/")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", user.id.toString());
    requestHeaders.set("x-user-role", user.role);
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/user/:path*",
    "/api/tickets/:path*",
    "/api/departments/:path*",
    "/api/faq/:path*",
    "/api/messages/:path*",
    "/api/notifications/:path*",
    "/api/upload/:path*",
    "/api/users/:path*",
  ],
};
