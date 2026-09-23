import type { BusinessReferenceIntegrationConfig } from "@/lib/business-reference-integration-config";
import type {
  BusinessReferenceProvider,
  BusinessReferenceProviderRequest,
} from "@/modules/business-references/application/business-reference-provider";
import {
  providerBusinessReferenceResponseSchema,
  type ProviderBusinessReference,
} from "@/modules/business-references/contracts/business-reference-contracts";
import { BusinessReferenceError } from "@/modules/business-references/domain/business-reference-error";

const MAX_RESPONSE_BYTES = 256 * 1024;
type FetchImplementation = typeof fetch;

export class HttpBusinessReferenceProvider
  implements BusinessReferenceProvider
{
  constructor(
    private readonly config: BusinessReferenceIntegrationConfig,
    private readonly fetchImplementation: FetchImplementation = fetch
  ) {}

  search(
    input: BusinessReferenceProviderRequest & { query: string; limit: number }
  ) {
    return this.execute("v1/business-references/search", input);
  }

  verify(
    input: BusinessReferenceProviderRequest & { externalIds: string[] }
  ) {
    return this.execute("v1/business-references/verify", input);
  }

  private async execute(
    path: string,
    input: BusinessReferenceProviderRequest & Record<string, unknown>
  ): Promise<ProviderBusinessReference[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await this.fetchImplementation(
        new URL(path, this.config.baseUrl),
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.config.token}`,
            "Content-Type": "application/json",
            "x-contract-version": this.config.contractVersion,
            "x-request-id": input.requestId,
          },
          body: JSON.stringify(input),
          cache: "no-store",
          redirect: "error",
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          throw new BusinessReferenceError(
            "سرویس مرجع کسب‌وکار موقتاً در دسترس نیست",
            "DEPENDENCY_UNAVAILABLE",
            503
          );
        }
        throw new BusinessReferenceError(
          "پاسخ سرویس مرجع کسب‌وکار معتبر نیست",
          "UPSTREAM_INVALID_RESPONSE",
          502
        );
      }

      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        throw this.invalidResponse();
      }
      const rawBody = await response.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_RESPONSE_BYTES) {
        throw this.invalidResponse();
      }

      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        throw this.invalidResponse();
      }
      const parsed = providerBusinessReferenceResponseSchema.safeParse(body);
      if (!parsed.success) throw this.invalidResponse();
      if (
        parsed.data.contractVersion !== this.config.contractVersion ||
        parsed.data.contextToken !== input.context.contextToken ||
        parsed.data.subjectType !== input.subjectType ||
        parsed.data.items.some((item) => item.entityType !== input.subjectType)
      ) {
        throw this.invalidResponse();
      }

      const identities = parsed.data.items.map(
        (item) => `${item.sourceSystem}:${item.externalId}`
      );
      if (new Set(identities).size !== identities.length) {
        throw this.invalidResponse();
      }
      return parsed.data.items;
    } catch (error) {
      if (error instanceof BusinessReferenceError) throw error;
      throw new BusinessReferenceError(
        "سرویس مرجع کسب‌وکار موقتاً در دسترس نیست",
        "DEPENDENCY_UNAVAILABLE",
        503
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private invalidResponse() {
    return new BusinessReferenceError(
      "پاسخ سرویس مرجع کسب‌وکار معتبر نیست",
      "UPSTREAM_INVALID_RESPONSE",
      502
    );
  }
}
