import { getCurrentUser, type CurrentUser } from "@/lib/current-user";
import {
  consumeRateLimit,
  type RateLimitPolicy,
} from "@/lib/rate-limit";
import { apiV2Error } from "@/modules/shared/api-v2-response";
import {
  isAgentWorkspaceV2Enabled,
  isAutomatedResolutionEnabled,
  isBusinessReferenceIntegrationEnabled,
  isOrganizationContextEnabled,
  isReportingApiEnabled,
  isSupportV2ReadEnabled,
  isSupportV2WriteEnabled,
} from "@/lib/feature-flags";
import { isReportingActorAllowedInRollout } from "@/lib/reporting-rollout-config";

type Authorized = { authorized: true; user: CurrentUser };
type Denied = {
  authorized: false;
  response: ReturnType<typeof apiV2Error>;
};

type Options = {
  rateLimit?: RateLimitPolicy;
};

export async function requireApiV2User(
  request: Request,
  options: Options = {}
): Promise<Authorized | Denied> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      authorized: false,
      response: apiV2Error(
        request,
        "نشست کاربری معتبر نیست",
        401,
        "UNAUTHENTICATED"
      ),
    };
  }

  if (options.rateLimit) {
    const result = await consumeRateLimit(
      options.rateLimit,
      `user:${user.id}`
    );
    if (!result.allowed) {
      const response = apiV2Error(
        request,
        "تعداد درخواست‌ها بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید",
        429,
        "RATE_LIMITED"
      );
      response.headers.set("Retry-After", String(result.retryAfterSeconds));
      return { authorized: false, response };
    }
  }

  return { authorized: true, user };
}

export async function requireOrganizationApiV2User(
  request: Request,
  options: Options = {}
): Promise<Authorized | Denied> {
  if (!isOrganizationContextEnabled()) {
    return {
      authorized: false,
      response: apiV2Error(
        request,
        "قابلیت سازمان‌ها فعال نیست",
        404,
        "NOT_FOUND"
      ),
    };
  }

  return requireApiV2User(request, options);
}

function featureDisabled(request: Request, message: string): Denied {
  return {
    authorized: false,
    response: apiV2Error(request, message, 404, "NOT_FOUND"),
  };
}

export async function requireSupportCatalogApiV2User(
  request: Request,
  options: Options = {}
): Promise<Authorized | Denied> {
  if (!isSupportV2ReadEnabled()) {
    return featureDisabled(request, "کاتالوگ جدید پشتیبانی فعال نیست");
  }
  return requireApiV2User(request, options);
}

export async function requireSupportTicketWriteApiV2User(
  request: Request,
  options: Options = {}
): Promise<Authorized | Denied> {
  if (!isSupportV2WriteEnabled()) {
    return featureDisabled(request, "ثبت تیکت در نسخه جدید فعال نیست");
  }
  return requireApiV2User(request, options);
}

export async function requireWorkspaceApiV2User(
  request: Request,
  options: Options = {}
): Promise<Authorized | Denied> {
  if (!isAgentWorkspaceV2Enabled()) {
    return featureDisabled(request, "فضای کاری جدید پشتیبانی فعال نیست");
  }
  return requireApiV2User(request, options);
}

export async function requireBusinessReferenceApiV2User(
  request: Request,
  options: Options = {}
): Promise<Authorized | Denied> {
  if (!isSupportV2ReadEnabled() || !isBusinessReferenceIntegrationEnabled()) {
    return featureDisabled(request, "یکپارچه‌سازی موضوع کسب‌وکار فعال نیست");
  }
  return requireApiV2User(request, options);
}

export async function requireReportingApiV2User(
  request: Request,
  options: Options = {}
): Promise<Authorized | Denied> {
  if (!isReportingApiEnabled()) {
    return featureDisabled(request, "گزارش‌های مدیریتی فعال نیست");
  }
  const authorization = await requireApiV2User(request, options);
  if (
    authorization.authorized &&
    !isReportingActorAllowedInRollout(authorization.user.id)
  ) {
    return featureDisabled(request, "گزارش‌های مدیریتی برای این کاربر فعال نیست");
  }
  return authorization;
}

export async function requireAutomatedResolutionApiV2User(
  request: Request,
  options: Options = {}
): Promise<Authorized | Denied> {
  if (!isAutomatedResolutionEnabled()) {
    return featureDisabled(request, "راهنمای حل خودکار فعال نیست");
  }
  return requireApiV2User(request, options);
}
