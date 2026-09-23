import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/lib/domain-error";
import { logOperationalError } from "@/lib/operational-logger";

export type ApiErrorCode = "INVALID_REQUEST" | "MALFORMED_JSON" | "INVALID_PATH_PARAMETER" | "NOT_FOUND" | "CONFLICT" | "UNAUTHORIZED" | "FORBIDDEN" | "CSRF_FAILED" | "RATE_LIMITED" | "INTERNAL_ERROR";

interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
  details?: { fieldErrors: Record<string, string[]> };
}

type ValidationSuccess<T> = { success: true; data: T };
type ValidationFailure = { success: false; response: NextResponse<ApiErrorBody> };
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export function apiError(error: string, status: number, code: ApiErrorCode, details?: ApiErrorBody["details"]) {
  return NextResponse.json({ error, code, ...(details ? { details } : {}) }, { status });
}

export function rateLimitError(retryAfterSeconds: number) {
  const response = apiError(
    "تعداد درخواست‌ها بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید",
    429,
    "RATE_LIMITED"
  );
  response.headers.set("Retry-After", String(retryAfterSeconds));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function fromZodError(error: z.ZodError): ValidationFailure {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.length > 0 ? issue.path.join(".") : "request";
    const message = issue.code === "unrecognized_keys"
      ? `فیلدهای ناشناخته مجاز نیستند: ${issue.keys.join(", ")}`
      : issue.message;
    fieldErrors[field] = [...(fieldErrors[field] ?? []), message];
  }
  const firstMessage = Object.values(fieldErrors)[0]?.[0] ?? "داده‌های ورودی معتبر نیستند";
  return {
    success: false,
    response: apiError(firstMessage, 400, "INVALID_REQUEST", { fieldErrors }),
  };
}

export async function parseJsonBody<T extends z.ZodType>(request: Request, schema: T): Promise<ValidationResult<z.output<T>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { success: false, response: apiError("بدنه JSON معتبر نیست", 400, "MALFORMED_JSON") };
  }
  const result = schema.safeParse(body);
  return result.success ? { success: true, data: result.data } : fromZodError(result.error);
}

export function parseQuery<T extends z.ZodType>(searchParams: URLSearchParams, schema: T): ValidationResult<z.output<T>> {
  const duplicateKey = [...new Set(searchParams.keys())].find((key) => searchParams.getAll(key).length > 1);
  if (duplicateKey) {
    return { success: false, response: apiError(`پارامتر ${duplicateKey} تکراری است`, 400, "INVALID_REQUEST") };
  }
  const result = schema.safeParse(Object.fromEntries(searchParams.entries()));
  return result.success ? { success: true, data: result.data } : fromZodError(result.error);
}

export function parsePositiveInteger(value: string, label = "شناسه"): ValidationResult<number> {
  if (!/^[1-9]\d*$/.test(value)) {
    return { success: false, response: apiError(`${label} معتبر نیست`, 400, "INVALID_PATH_PARAMETER") };
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return { success: false, response: apiError(`${label} معتبر نیست`, 400, "INVALID_PATH_PARAMETER") };
  }
  return { success: true, data: parsed };
}

export function parseTicketIdentifier(value: string): ValidationResult<string> {
  if (!/^[a-zA-Z0-9-]{3,100}$/.test(value)) {
    return { success: false, response: apiError("شناسه تیکت معتبر نیست", 400, "INVALID_PATH_PARAMETER") };
  }
  return { success: true, data: value };
}

export function handleApiError(error: unknown, fallbackMessage: string, context: string) {
  if (error instanceof DomainError) {
    const response = {
      VALIDATION: { status: 400, code: "INVALID_REQUEST" as const },
      NOT_FOUND: { status: 404, code: "NOT_FOUND" as const },
      CONFLICT: { status: 409, code: "CONFLICT" as const },
    }[error.kind];
    return apiError(error.message, response.status, response.code);
  }
  logOperationalError("api_request_failed", error, { operation: context });
  return apiError(fallbackMessage, 500, "INTERNAL_ERROR");
}
