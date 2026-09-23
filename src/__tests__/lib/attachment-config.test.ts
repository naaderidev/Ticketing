import {
  getAttachmentConfig,
  resetAttachmentConfigForTests,
} from "@/lib/attachment-config";

const ENVIRONMENT_KEYS = [
  "ATTACHMENT_STORAGE_DRIVER",
  "ATTACHMENT_LOCAL_STORAGE_PATH",
  "ATTACHMENT_STORAGE_ENDPOINT",
  "ATTACHMENT_STORAGE_REGION",
  "ATTACHMENT_STORAGE_BUCKET",
  "ATTACHMENT_STORAGE_ACCESS_KEY_ID",
  "ATTACHMENT_STORAGE_SECRET_ACCESS_KEY",
  "ATTACHMENT_STORAGE_FORCE_PATH_STYLE",
  "ATTACHMENT_SCAN_MODE",
  "DEMO_MODE",
] as const;

function setNodeEnvironment(
  value: "development" | "production" | "test"
): void {
  process.env = { ...process.env, NODE_ENV: value };
}

describe("attachment configuration", () => {
  const originalEnvironment = new Map(
    ENVIRONMENT_KEYS.map((key) => [key, process.env[key]])
  );

  beforeEach(() => {
    setNodeEnvironment("test");
    process.env.ATTACHMENT_SCAN_MODE = "disabled";
    resetAttachmentConfigForTests();
  });

  afterEach(() => {
    setNodeEnvironment("test");
    resetAttachmentConfigForTests();
    for (const key of ENVIRONMENT_KEYS) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("supports private filesystem storage outside production", () => {
    process.env.ATTACHMENT_STORAGE_DRIVER = "filesystem";
    process.env.ATTACHMENT_LOCAL_STORAGE_PATH = ".local-data/test-attachments";

    expect(getAttachmentConfig().storage).toEqual({
      driver: "filesystem",
      rootDirectory: ".local-data/test-attachments",
    });
  });

  it("rejects filesystem storage in production", () => {
    setNodeEnvironment("production");
    process.env.ATTACHMENT_STORAGE_DRIVER = "filesystem";

    expect(() => getAttachmentConfig()).toThrow(
      "ATTACHMENT_STORAGE_DRIVER cannot be filesystem in production"
    );
  });

  it("supports filesystem storage and disabled scanning in production demo mode", () => {
    setNodeEnvironment("production");
    process.env.DEMO_MODE = "true";
    process.env.ATTACHMENT_STORAGE_DRIVER = "filesystem";
    process.env.ATTACHMENT_LOCAL_STORAGE_PATH = ".local-data/demo-attachments";

    expect(getAttachmentConfig()).toMatchObject({
      storage: {
        driver: "filesystem",
        rootDirectory: ".local-data/demo-attachments",
      },
      scanner: { mode: "disabled" },
    });
  });
});
