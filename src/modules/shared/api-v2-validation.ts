import { z } from "zod";
import { apiV2Error } from "@/modules/shared/api-v2-response";

type ValidationSuccess<T> = { success: true; data: T };
type ValidationFailure = {
  success: false;
  response: ReturnType<typeof apiV2Error>;
};

export type ApiV2ValidationResult<T> =
  | ValidationSuccess<T>
  | ValidationFailure;

function fromZodError(
  request: Request,
  error: z.ZodError
): ValidationFailure {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.length > 0 ? issue.path.join(".") : "request";
    const message =
      issue.code === "unrecognized_keys"
        ? `فیلدهای ناشناخته مجاز نیستند: ${issue.keys.join(", ")}`
        : issue.message;
    fieldErrors[field] = [...(fieldErrors[field] ?? []), message];
  }

  const message =
    Object.values(fieldErrors)[0]?.[0] ?? "داده‌های ورودی معتبر نیستند";
  return {
    success: false,
    response: apiV2Error(request, message, 400, "INVALID_REQUEST", {
      fieldErrors,
    }),
  };
}

export async function parseApiV2Json<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<ApiV2ValidationResult<z.output<T>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      success: false,
      response: apiV2Error(
        request,
        "بدنه JSON معتبر نیست",
        400,
        "MALFORMED_JSON"
      ),
    };
  }

  const result = schema.safeParse(body);
  return result.success
    ? { success: true, data: result.data }
    : fromZodError(request, result.error);
}

export function parseApiV2Query<T extends z.ZodType>(
  request: Request,
  searchParams: URLSearchParams,
  schema: T
): ApiV2ValidationResult<z.output<T>> {
  const query: Record<string, string> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    if (values.length !== 1) {
      return {
        success: false,
        response: apiV2Error(
          request,
          `پارامتر ${key} نباید تکرار شود`,
          400,
          "INVALID_REQUEST",
          { fieldErrors: { [key]: ["پارامتر تکراری مجاز نیست"] } }
        ),
      };
    }
    query[key] = values[0];
  }

  const result = schema.safeParse(query);
  return result.success
    ? { success: true, data: result.data }
    : fromZodError(request, result.error);
}

export function parseApiV2PositiveInteger(
  request: Request,
  value: string,
  label = "شناسه"
): ApiV2ValidationResult<number> {
  if (!/^[1-9]\d*$/.test(value)) {
    return {
      success: false,
      response: apiV2Error(
        request,
        `${label} معتبر نیست`,
        400,
        "INVALID_PATH_PARAMETER"
      ),
    };
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return {
      success: false,
      response: apiV2Error(
        request,
        `${label} معتبر نیست`,
        400,
        "INVALID_PATH_PARAMETER"
      ),
    };
  }

  return { success: true, data: parsed };
}
