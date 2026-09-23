import { apiV2Error } from "@/modules/shared/api-v2-response";

const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

export function parseIdempotencyKey(request: Request):
  | { success: true; data: string }
  | { success: false; response: ReturnType<typeof apiV2Error> } {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value || !SAFE_IDEMPOTENCY_KEY.test(value)) {
    return {
      success: false,
      response: apiV2Error(
        request,
        "ارسال Idempotency-Key معتبر الزامی است",
        400,
        "INVALID_REQUEST"
      ),
    };
  }
  return { success: true, data: value };
}
