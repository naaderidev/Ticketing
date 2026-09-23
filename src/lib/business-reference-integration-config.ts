import {
  EXTERNAL_BUSINESS_SUBJECT_TYPES,
  externalBusinessSubjectTypeSchema,
  type ExternalBusinessSubjectType,
} from "@/modules/business-references/contracts/business-reference-contracts";

const CONTRACT_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

export type BusinessReferenceIntegrationConfig = {
  baseUrl: string;
  token: string;
  contractVersion: string;
  timeoutMs: number;
  enabledSubjectTypes: ReadonlySet<ExternalBusinessSubjectType>;
};

function resolveBaseUrl(value: string | undefined, nodeEnvironment: string | undefined) {
  if (!value?.trim()) {
    throw new Error("BUSINESS_REFERENCE_PROVIDER_URL must be configured");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("BUSINESS_REFERENCE_PROVIDER_URL must be a valid URL");
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["http:", "https:"].includes(url.protocol)
  ) {
    throw new Error("BUSINESS_REFERENCE_PROVIDER_URL has unsupported URL components");
  }
  if (nodeEnvironment === "production" && url.protocol !== "https:") {
    throw new Error("BUSINESS_REFERENCE_PROVIDER_URL must use HTTPS in production");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url.toString();
}

function resolveTimeout(value: string | undefined): number {
  if (!value?.trim()) return 2_000;
  const timeout = Number(value);
  if (!Number.isSafeInteger(timeout) || timeout < 250 || timeout > 10_000) {
    throw new Error(
      "BUSINESS_REFERENCE_PROVIDER_TIMEOUT_MS must be an integer between 250 and 10000"
    );
  }
  return timeout;
}

function resolveEnabledSubjectTypes(
  value: string | undefined
): ReadonlySet<ExternalBusinessSubjectType> {
  if (!value?.trim()) {
    throw new Error("BUSINESS_REFERENCE_PROVIDER_SUBJECT_TYPES must be configured");
  }
  const values = value.split(",").map((item) => item.trim());
  const unique = new Set(values);
  if (values.some((item) => !item) || unique.size !== values.length) {
    throw new Error(
      "BUSINESS_REFERENCE_PROVIDER_SUBJECT_TYPES must contain unique comma-separated values"
    );
  }
  const parsed = values.map((item) => externalBusinessSubjectTypeSchema.safeParse(item));
  if (parsed.some((result) => !result.success)) {
    throw new Error(
      `BUSINESS_REFERENCE_PROVIDER_SUBJECT_TYPES must use: ${EXTERNAL_BUSINESS_SUBJECT_TYPES.join(",")}`
    );
  }
  return new Set(parsed.map((result) => result.data!));
}

export function resolveBusinessReferenceIntegrationConfig(
  environment: Readonly<Record<string, string | undefined>>
): BusinessReferenceIntegrationConfig {
  const token = environment.BUSINESS_REFERENCE_PROVIDER_TOKEN?.trim();
  if (!token || token.length < 32 || token.startsWith("replace_")) {
    throw new Error(
      "BUSINESS_REFERENCE_PROVIDER_TOKEN must contain at least 32 non-placeholder characters"
    );
  }
  const contractVersion =
    environment.BUSINESS_REFERENCE_PROVIDER_CONTRACT_VERSION?.trim();
  if (!contractVersion || !CONTRACT_VERSION_PATTERN.test(contractVersion)) {
    throw new Error(
      "BUSINESS_REFERENCE_PROVIDER_CONTRACT_VERSION must be 1-32 URL-safe characters"
    );
  }

  return {
    baseUrl: resolveBaseUrl(
      environment.BUSINESS_REFERENCE_PROVIDER_URL,
      environment.NODE_ENV
    ),
    token,
    contractVersion,
    timeoutMs: resolveTimeout(environment.BUSINESS_REFERENCE_PROVIDER_TIMEOUT_MS),
    enabledSubjectTypes: resolveEnabledSubjectTypes(
      environment.BUSINESS_REFERENCE_PROVIDER_SUBJECT_TYPES
    ),
  };
}

export function getBusinessReferenceIntegrationConfig() {
  return resolveBusinessReferenceIntegrationConfig(process.env);
}
