import type { PartyContextDto } from "@/modules/organizations/application/party-context-service";
import type {
  ExternalBusinessSubjectType,
  ProviderBusinessReference,
} from "@/modules/business-references/contracts/business-reference-contracts";

export type BusinessReferenceProviderContext = {
  partyId: number;
  organizationId: number | null;
  scopes: Array<{ type: string; key: string }>;
  contextToken: string;
};

export type BusinessReferenceProviderRequest = {
  requestId: string;
  subjectType: ExternalBusinessSubjectType;
  context: BusinessReferenceProviderContext;
};

export interface BusinessReferenceProvider {
  search(
    input: BusinessReferenceProviderRequest & { query: string; limit: number }
  ): Promise<ProviderBusinessReference[]>;
  verify(
    input: BusinessReferenceProviderRequest & { externalIds: string[] }
  ): Promise<ProviderBusinessReference[]>;
}

export function toProviderContext(
  context: PartyContextDto,
  contextToken: string
): BusinessReferenceProviderContext {
  return {
    partyId: context.partyId,
    organizationId: context.organization?.id ?? null,
    scopes: (context.organization?.scopes ?? [])
      .map((scope) => ({ type: scope.type, key: scope.scopeKey }))
      .sort((left, right) =>
        `${left.type}:${left.key}`.localeCompare(`${right.type}:${right.key}`)
      ),
    contextToken,
  };
}
