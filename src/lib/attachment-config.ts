import { isDemoMode } from "@/lib/demo-mode";

const DEFAULT_UPLOAD_TTL_HOURS = 24;
const DEFAULT_CLAMAV_PORT = 3310;

type AttachmentStorageConfig =
  | {
      driver: "filesystem";
      rootDirectory: string;
    }
  | {
      driver: "s3";
      endpoint?: string;
      region: string;
      bucket: string;
      credentials?: { accessKeyId: string; secretAccessKey: string };
      forcePathStyle: boolean;
    };

export interface AttachmentConfig {
  storage: AttachmentStorageConfig;
  scanner:
    | { mode: "disabled" }
    | { mode: "clamav"; host: string; port: number };
  pendingUploadTtlHours: number;
}

let cachedConfig: AttachmentConfig | undefined;

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured`);
  return value;
}

function positiveIntegerEnvironmentValue(
  name: string,
  fallback: number
): number {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return fallback;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function readScannerConfig(): AttachmentConfig["scanner"] {
  const productionSecurityRequired =
    process.env.NODE_ENV === "production" && !isDemoMode();
  const defaultMode = productionSecurityRequired ? "clamav" : "disabled";
  const mode = process.env.ATTACHMENT_SCAN_MODE?.trim() || defaultMode;

  if (mode === "disabled") {
    if (productionSecurityRequired) {
      throw new Error("ATTACHMENT_SCAN_MODE cannot be disabled in production");
    }
    return { mode: "disabled" };
  }
  if (mode !== "clamav") {
    throw new Error("ATTACHMENT_SCAN_MODE must be either clamav or disabled");
  }

  return {
    mode: "clamav",
    host: requiredEnvironmentValue("CLAMAV_HOST"),
    port: positiveIntegerEnvironmentValue("CLAMAV_PORT", DEFAULT_CLAMAV_PORT),
  };
}

function readStorageConfig(): AttachmentStorageConfig {
  const driver = process.env.ATTACHMENT_STORAGE_DRIVER?.trim() || "s3";

  if (driver === "filesystem") {
    if (process.env.NODE_ENV === "production" && !isDemoMode()) {
      throw new Error(
        "ATTACHMENT_STORAGE_DRIVER cannot be filesystem in production"
      );
    }

    const rootDirectory =
      process.env.ATTACHMENT_LOCAL_STORAGE_PATH?.trim() ||
      ".local-data/private-attachments";
    return { driver, rootDirectory };
  }

  if (driver !== "s3") {
    throw new Error(
      "ATTACHMENT_STORAGE_DRIVER must be either s3 or filesystem"
    );
  }

  const accessKeyId = process.env.ATTACHMENT_STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey =
    process.env.ATTACHMENT_STORAGE_SECRET_ACCESS_KEY?.trim();
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error(
      "Both attachment storage credential variables must be set together"
    );
  }

  return {
    driver,
    endpoint: process.env.ATTACHMENT_STORAGE_ENDPOINT?.trim() || undefined,
    region: requiredEnvironmentValue("ATTACHMENT_STORAGE_REGION"),
    bucket: requiredEnvironmentValue("ATTACHMENT_STORAGE_BUCKET"),
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
    forcePathStyle:
      process.env.ATTACHMENT_STORAGE_FORCE_PATH_STYLE?.trim() === "true",
  };
}

export function getAttachmentConfig(): AttachmentConfig {
  if (cachedConfig) return cachedConfig;

  cachedConfig = {
    storage: readStorageConfig(),
    scanner: readScannerConfig(),
    pendingUploadTtlHours: positiveIntegerEnvironmentValue(
      "ATTACHMENT_PENDING_TTL_HOURS",
      DEFAULT_UPLOAD_TTL_HOURS
    ),
  };

  return cachedConfig;
}

export function resetAttachmentConfigForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Attachment configuration can only be reset in tests");
  }
  cachedConfig = undefined;
}

export function getAttachmentCleanupToken(): string {
  const token = process.env.ATTACHMENT_CLEANUP_TOKEN?.trim();
  if (!token || token.length < 32) {
    throw new Error("ATTACHMENT_CLEANUP_TOKEN must contain at least 32 characters");
  }
  return token;
}
