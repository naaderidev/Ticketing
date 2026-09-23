import { recordAuditEvent } from "@/lib/audit-log";
import { BUSINESS_REFERENCE_LOOKUP_LIMIT } from "@/lib/rate-limit";
import { getRequestId } from "@/lib/request-security";
import {
  searchBusinessReferences,
} from "@/modules/business-references/application/business-reference-service";
import {
  businessReferenceSearchQuerySchema,
  externalBusinessSubjectTypeSchema,
} from "@/modules/business-references/contracts/business-reference-contracts";
import { isBusinessReferenceError } from "@/modules/business-references/domain/business-reference-error";
import { requireBusinessReferenceApiV2User } from "@/modules/shared/api-v2-authorization";
import {
  apiV2Error,
  apiV2ListSuccess,
  handleApiV2Error,
} from "@/modules/shared/api-v2-response";
import { parseApiV2Query } from "@/modules/shared/api-v2-validation";

type RouteContext = { params: Promise<{ subjectType: string }> };

export async function GET(request: Request, context: RouteContext) {
  let actor: { id: number; sessionId: string } | null = null;
  let subjectTypeForAudit: string | null = null;
  try {
    const auth = await requireBusinessReferenceApiV2User(request, {
      rateLimit: BUSINESS_REFERENCE_LOOKUP_LIMIT,
    });
    if (!auth.authorized) return auth.response;
    actor = auth.user;

    const params = await context.params;
    const subjectType = externalBusinessSubjectTypeSchema.safeParse(
      params.subjectType
    );
    if (!subjectType.success) {
      return apiV2Error(
        request,
        "نوع موضوع کسب‌وکار معتبر نیست",
        400,
        "INVALID_PATH_PARAMETER"
      );
    }
    subjectTypeForAudit = subjectType.data;

    const query = parseApiV2Query(
      request,
      new URL(request.url).searchParams,
      businessReferenceSearchQuerySchema
    );
    if (!query.success) return query.response;

    const result = await searchBusinessReferences({
      user: auth.user,
      subjectType: subjectType.data,
      query: query.data,
      requestId: getRequestId(request),
    });
    await recordAuditEvent({
      request,
      action: "BUSINESS_REFERENCE_SEARCH",
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      activePartyId: result.partyId,
      organizationId: result.organizationId ?? undefined,
      sessionId: auth.user.sessionId,
      targetType: "BUSINESS_SUBJECT",
      metadata: {
        subjectType: subjectType.data,
        resultCount: result.items.length,
      },
    });
    return apiV2ListSuccess(request, result.items, {
      nextCursor: null,
      hasMore: false,
      limit: query.data.limit,
    });
  } catch (error) {
    if (actor) {
      await recordAuditEvent({
        request,
        action: "BUSINESS_REFERENCE_SEARCH",
        outcome: "FAILURE",
        actorUserId: actor.id,
        sessionId: actor.sessionId,
        targetType: "BUSINESS_SUBJECT",
        metadata: { subjectType: subjectTypeForAudit },
      });
    }
    if (isBusinessReferenceError(error)) {
      return apiV2Error(request, error.message, error.status, error.code);
    }
    return handleApiV2Error(
      request,
      error,
      "خطا در دریافت موضوع‌های کسب‌وکار",
      "GET /api/v2/business-subjects/[subjectType]"
    );
  }
}
