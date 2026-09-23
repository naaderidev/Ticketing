import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth-token";
import {
  isProtectedApiPath,
  isProtectedPagePath,
} from "@/lib/route-access-policy";
import { isTrustedMutationRequest } from "@/lib/csrf-protection";
import { getRequestId } from "@/lib/request-security";

const COOKIE_NAME = "auth-token";

async function readSession(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

function withRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set("x-request-id", requestId);
  return response;
}

function continueWithRequestId(
  request: NextRequest,
  requestId: string
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  return withRequestId(
    NextResponse.next({ request: { headers: requestHeaders } }),
    requestId
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = getRequestId(request);

  if (pathname.startsWith("/uploads/")) {
    return withRequestId(
      NextResponse.json({ error: "فایل یافت نشد" }, { status: 404 }),
      requestId
    );
  }

  if (!isTrustedMutationRequest(request)) {
    return withRequestId(
      NextResponse.json(
        { error: "مبدأ درخواست معتبر نیست", code: "CSRF_FAILED" },
        {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        }
      ),
      requestId
    );
  }

  const session = await readSession(request);

  if (isProtectedPagePath(pathname) && !session) {
    const url = request.nextUrl.clone();
    url.pathname = "/user/login";
    url.searchParams.set("redirect", pathname);
    return withRequestId(NextResponse.redirect(url), requestId);
  }

  if (isProtectedApiPath(pathname) && !session) {
    return withRequestId(
      NextResponse.json(
        { error: "احراز هویت الزامی است" },
        { status: 401 }
      ),
      requestId
    );
  }

  return continueWithRequestId(request, requestId);
}

export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/user/:path*",
    "/api/:path*",
    "/uploads/:path*",
  ],
};
