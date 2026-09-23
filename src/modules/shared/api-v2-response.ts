import { NextResponse } from "next/server";
import { DomainError } from "@/lib/domain-error";
import { logOperationalError } from "@/lib/operational-logger";
import { getRequestId } from "@/lib/request-security";
import { toJalaliApiPayload } from "@/lib/jalali-date";

type ApiV2ErrorCode =
  | "INVALID_REQUEST"
  | "MALFORMED_JSON"
  | "INVALID_PATH_PARAMETER"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BUSINESS_RULE_VIOLATION"
  | "CONCURRENT_MODIFICATION"
  | "DEPENDENCY_UNAVAILABLE"
  | "UPSTREAM_INVALID_RESPONSE"
  | "IDEMPOTENCY_IN_PROGRESS"
  | "IDEMPOTENCY_KEY_REUSED"
  | "INVALID_CURSOR"
  | "INVALID_TRANSITION"
  | "ACTIVE_INCIDENT"
  | "PRECONDITION_REQUIRED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

type ApiV2ErrorDetails = {
  fieldErrors: Record<string, string[]>;
};

type SuccessOptions = {
  status?: number;
  headers?: HeadersInit;
};

export type ApiV2ListPage = {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
};

export function apiV2Success<T>(
  request: Request,
  data: T,
  options: SuccessOptions = {}
) {
  const requestId = getRequestId(request);
  const response = NextResponse.json(
    toJalaliApiPayload({ data, meta: { requestId } }),
    { status: options.status ?? 200, headers: options.headers }
  );
  response.headers.set("x-request-id", requestId);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function apiV2ListSuccess<T>(
  request: Request,
  data: T[],
  page: ApiV2ListPage
) {
  const requestId = getRequestId(request);
  const response = NextResponse.json(
    toJalaliApiPayload({ data, page, meta: { requestId } })
  );
  response.headers.set("x-request-id", requestId);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function apiV2Error(
  request: Request,
  message: string,
  status: number,
  code: ApiV2ErrorCode,
  details?: ApiV2ErrorDetails
) {
  const requestId = getRequestId(request);
  const response = NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        requestId,
      },
    },
    { status }
  );
  response.headers.set("x-request-id", requestId);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function handleApiV2Error(
  request: Request,
  error: unknown,
  fallbackMessage: string,
  operation: string
) {
  if (error instanceof DomainError) {
    const response = {
      VALIDATION: { status: 400, code: "INVALID_REQUEST" as const },
      NOT_FOUND: { status: 404, code: "NOT_FOUND" as const },
      CONFLICT: { status: 409, code: "CONFLICT" as const },
    }[error.kind];
    return apiV2Error(request, error.message, response.status, response.code);
  }

  logOperationalError("api_v2_request_failed", error, { operation });
  return apiV2Error(
    request,
    fallbackMessage,
    500,
    "INTERNAL_ERROR"
  );
}
