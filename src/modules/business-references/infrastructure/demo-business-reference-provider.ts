import type {
  BusinessReferenceProvider,
  BusinessReferenceProviderRequest,
} from "@/modules/business-references/application/business-reference-provider";
import type {
  ExternalBusinessSubjectType,
  ProviderBusinessReference,
} from "@/modules/business-references/contracts/business-reference-contracts";

const DEMO_REFERENCES: Record<
  ExternalBusinessSubjectType,
  Array<{ externalId: string; displayLabel: string }>
> = {
  CONTRACT: [
    { externalId: "CTR-DEMO-1405-001", displayLabel: "قرارداد تأمین برق ۱۴۰۵/۰۰۱" },
    { externalId: "CTR-DEMO-1405-002", displayLabel: "قرارداد خدمات اندازه‌گیری ۱۴۰۵/۰۰۲" },
  ],
  INVOICE: [
    { externalId: "INV-DEMO-1405-001", displayLabel: "صورتحساب شهریور ۱۴۰۵" },
  ],
  PAYMENT: [
    { externalId: "PAY-DEMO-1405-001", displayLabel: "پرداخت آزمایشی شهریور ۱۴۰۵" },
  ],
  SETTLEMENT: [
    { externalId: "SET-DEMO-1405-001", displayLabel: "تسویه فروش برق مرداد ۱۴۰۵" },
  ],
  POWER_PLANT: [
    { externalId: "PLANT-DEMO-YAZD-001", displayLabel: "نیروگاه خورشیدی یزد" },
  ],
  METER: [
    { externalId: "METER-DEMO-001", displayLabel: "کنتور اصلی نیروگاه یزد" },
  ],
  SAVING_PROGRAM: [
    { externalId: "SAVE-DEMO-1405-001", displayLabel: "برنامه پاداش صرفه‌جویی تابستان ۱۴۰۵" },
  ],
};

function isAuthorized(
  input: BusinessReferenceProviderRequest,
  externalId: string
): boolean {
  if (input.context.organizationId === null) return true;
  const scopes = input.context.scopes;
  if (scopes.some((scope) => scope.type === "ORGANIZATION" && scope.key === "*")) {
    return true;
  }
  if (input.subjectType === "CONTRACT") {
    return scopes.some(
      (scope) =>
        scope.type === "CONTRACT" &&
        (scope.key === "*" || scope.key === externalId)
    );
  }
  if (["POWER_PLANT", "METER", "SAVING_PROGRAM"].includes(input.subjectType)) {
    return scopes.some(
      (scope) => scope.type === "ASSET" && (scope.key === "*" || scope.key === externalId)
    );
  }
  return false;
}

function toProviderItem(
  input: BusinessReferenceProviderRequest,
  reference: { externalId: string; displayLabel: string }
): ProviderBusinessReference {
  const now = new Date();
  return {
    sourceSystem: "TICKETING_DEMO",
    entityType: input.subjectType,
    externalId: reference.externalId,
    displayLabel: reference.displayLabel,
    snapshotAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
    sourceVersion: "demo-v1",
    etag: `${input.subjectType}:${reference.externalId}:demo-v1`,
    authorized: isAuthorized(input, reference.externalId),
  };
}

export class DemoBusinessReferenceProvider implements BusinessReferenceProvider {
  async search(
    input: BusinessReferenceProviderRequest & { query: string; limit: number }
  ): Promise<ProviderBusinessReference[]> {
    const query = input.query.trim().toLocaleLowerCase("fa");
    return DEMO_REFERENCES[input.subjectType]
      .filter(
        (reference) =>
          reference.externalId.toLowerCase().includes(query) ||
          reference.displayLabel.toLocaleLowerCase("fa").includes(query)
      )
      .slice(0, input.limit)
      .map((reference) => toProviderItem(input, reference));
  }

  async verify(
    input: BusinessReferenceProviderRequest & { externalIds: string[] }
  ): Promise<ProviderBusinessReference[]> {
    const requested = new Set(input.externalIds);
    return DEMO_REFERENCES[input.subjectType]
      .filter((reference) => requested.has(reference.externalId))
      .map((reference) => toProviderItem(input, reference));
  }
}
