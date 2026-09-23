import type { CurrentUser } from "@/lib/current-user";
import { getBusinessReferenceIntegrationConfig } from "@/lib/business-reference-integration-config";
import { isBusinessReferenceIntegrationEnabled } from "@/lib/feature-flags";
import { hashSecurityValue } from "@/lib/request-security";
import {
  getPartyContextSnapshot,
  type PartyContextDto,
} from "@/modules/organizations/application/party-context-service";
import {
  toProviderContext,
  type BusinessReferenceProvider,
} from "@/modules/business-references/application/business-reference-provider";
import type {
  BusinessReferenceSearchQuery,
  ExternalBusinessSubjectType,
  ProviderBusinessReference,
} from "@/modules/business-references/contracts/business-reference-contracts";
import { BusinessReferenceError } from "@/modules/business-references/domain/business-reference-error";
import { HttpBusinessReferenceProvider } from "@/modules/business-references/infrastructure/http-business-reference-provider";
import { DemoBusinessReferenceProvider } from "@/modules/business-references/infrastructure/demo-business-reference-provider";
import { isDemoMode } from "@/lib/demo-mode";

export type VerifiedBusinessReference = {
  sourceSystem: string;
  entityType: ExternalBusinessSubjectType;
  externalId: string;
  displayLabel: string;
  snapshotFetchedAt: Date;
  snapshotExpiresAt: Date | null;
  sourceVersion: string | null;
  sourceEtag: string | null;
};

function shouldUseLocalDemoProvider(): boolean {
  const providerUrl = process.env.BUSINESS_REFERENCE_PROVIDER_URL?.trim();
  return (
    (process.env.NODE_ENV !== "production" || isDemoMode()) &&
    (!providerUrl || providerUrl.includes("example.com"))
  );
}

function ensureIntegrationEnabled(subjectType: ExternalBusinessSubjectType) {
  if (!isBusinessReferenceIntegrationEnabled()) {
    throw new BusinessReferenceError(
      "یکپارچه‌سازی موضوع کسب‌وکار فعال نیست",
      "DEPENDENCY_UNAVAILABLE",
      503
    );
  }
  if (shouldUseLocalDemoProvider()) return null;
  const config = getBusinessReferenceIntegrationConfig();
  if (!config.enabledSubjectTypes.has(subjectType)) {
    throw new BusinessReferenceError(
      "سرویس مرجع این موضوع کسب‌وکار فعال نیست",
      "DEPENDENCY_UNAVAILABLE",
      503
    );
  }
  return config;
}

async function getActiveContext(user: CurrentUser): Promise<PartyContextDto> {
  const snapshot = await getPartyContextSnapshot(user);
  const context = snapshot.contexts.find(
    (candidate) => candidate.partyId === snapshot.activePartyId
  );
  if (!context) {
    throw new BusinessReferenceError(
      "طرف حساب فعال یافت نشد",
      "BUSINESS_RULE_VIOLATION",
      404
    );
  }
  return context;
}

function contextToken(context: PartyContextDto): string {
  const scopes = (context.organization?.scopes ?? [])
    .map((scope) => `${scope.type}:${scope.scopeKey}`)
    .sort();
  return hashSecurityValue(
    "business-reference-context",
    JSON.stringify({
      partyId: context.partyId,
      organizationId: context.organization?.id ?? null,
      membershipId: context.organization?.membershipId ?? null,
      scopes,
    })
  );
}

function normalizeItem(
  item: ProviderBusinessReference,
  now: Date
): VerifiedBusinessReference {
  const snapshotFetchedAt = new Date(item.snapshotAt);
  const snapshotExpiresAt = item.expiresAt ? new Date(item.expiresAt) : null;
  if (
    snapshotFetchedAt.getTime() > now.getTime() + 5 * 60 * 1000 ||
    (!snapshotExpiresAt &&
      snapshotFetchedAt.getTime() < now.getTime() - 5 * 60 * 1000) ||
    (snapshotExpiresAt && snapshotExpiresAt <= now)
  ) {
    throw new BusinessReferenceError(
      "Snapshot سرویس مرجع منقضی یا نامعتبر است",
      "UPSTREAM_INVALID_RESPONSE",
      502
    );
  }
  return {
    sourceSystem: item.sourceSystem,
    entityType: item.entityType,
    externalId: item.externalId,
    displayLabel: item.displayLabel,
    snapshotFetchedAt,
    snapshotExpiresAt,
    sourceVersion: item.sourceVersion ?? null,
    sourceEtag: item.etag ?? null,
  };
}

function createProvider(subjectType: ExternalBusinessSubjectType) {
  const config = ensureIntegrationEnabled(subjectType);
  if (!config) return new DemoBusinessReferenceProvider();
  return new HttpBusinessReferenceProvider(config);
}

export async function searchBusinessReferences(input: {
  user: CurrentUser;
  subjectType: ExternalBusinessSubjectType;
  query: BusinessReferenceSearchQuery;
  requestId: string;
  provider?: BusinessReferenceProvider;
}) {
  ensureIntegrationEnabled(input.subjectType);
  const context = await getActiveContext(input.user);
  const token = contextToken(context);
  const provider = input.provider ?? createProvider(input.subjectType);
  const items = await provider.search({
    requestId: input.requestId,
    subjectType: input.subjectType,
    context: toProviderContext(context, token),
    query: input.query.q,
    limit: input.query.limit,
  });
  const now = new Date();
  const normalizedItems = items
    .filter((item) => item.authorized)
    .map((item) => normalizeItem(item, now))
    .slice(0, input.query.limit);
  return {
    items: normalizedItems,
    partyId: context.partyId,
    organizationId: context.organization?.id ?? null,
  };
}

export async function verifyBusinessReferences(input: {
  context: PartyContextDto;
  subjectType: ExternalBusinessSubjectType;
  externalIds: string[];
  requestId: string;
  provider?: BusinessReferenceProvider;
}): Promise<VerifiedBusinessReference[]> {
  const provider = input.provider ?? createProvider(input.subjectType);
  if (input.externalIds.length === 0 || new Set(input.externalIds).size !== input.externalIds.length) {
    throw new BusinessReferenceError(
      "حداقل یک مرجع کسب‌وکار یکتا الزامی است",
      "BUSINESS_RULE_VIOLATION",
      422
    );
  }
  const token = contextToken(input.context);
  const items = await provider.verify({
    requestId: input.requestId,
    subjectType: input.subjectType,
    context: toProviderContext(input.context, token),
    externalIds: input.externalIds,
  });
  const requestedIds = new Set(input.externalIds);
  const returnedIds = new Set(items.map((item) => item.externalId));
  if (
    items.some((item) => !item.authorized || !requestedIds.has(item.externalId)) ||
    items.length !== requestedIds.size ||
    returnedIds.size !== requestedIds.size ||
    [...requestedIds].some((id) => !returnedIds.has(id))
  ) {
    throw new BusinessReferenceError(
      "مرجع کسب‌وکار یافت نشد یا در محدوده دسترسی نیست",
      "BUSINESS_RULE_VIOLATION",
      404
    );
  }
  const now = new Date();
  return items.map((item) => normalizeItem(item, now));
}
