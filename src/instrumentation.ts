import type { Instrumentation } from "next";
import { logOperationalError } from "@/lib/operational-logger";

function firstHeaderValue(
  value: string | string[] | undefined
): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      candidate
    )
    ? candidate
    : undefined;
}

export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context
) => {
  logOperationalError("unhandled_request_error", error, {
    requestId: firstHeaderValue(request.headers["x-request-id"]),
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
