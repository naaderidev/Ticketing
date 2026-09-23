import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getAttachmentConfig } from "@/lib/attachment-config";
import {
  deletePrivateObject,
  readPrivateObject,
  resolveFilesystemStorageRoot,
  resolveFilesystemStoragePath,
  storePrivateObject,
} from "@/lib/attachment-storage";

jest.mock("node:fs/promises", () => ({
  mkdir: jest.fn(),
  readFile: jest.fn(),
  unlink: jest.fn(),
  writeFile: jest.fn(),
}));

jest.mock("@aws-sdk/client-s3", () => ({
  DeleteObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  PutObjectCommand: jest.fn(),
  S3Client: jest.fn(() => ({
    destroy: jest.fn(),
    send: jest.fn(),
  })),
}));

jest.mock("@/lib/attachment-config", () => ({
  getAttachmentConfig: jest.fn(),
}));

describe("attachment storage", () => {
  const rootDirectory = resolve(".local-data/test-attachments");
  const storageKey = "attachments/7/51c7142b-87d0-4e34-9a77-8c3df04fdbdc";
  const content = Buffer.from("private attachment");

  beforeEach(() => {
    (getAttachmentConfig as jest.Mock).mockReturnValue({
      storage: { driver: "filesystem", rootDirectory },
    });
  });

  it("stores and reads development files below the private root", async () => {
    (readFile as jest.Mock).mockResolvedValue(content);

    await storePrivateObject(storageKey, content, "text/plain", "checksum");
    const result = await readPrivateObject(storageKey);

    const objectPath = resolve(rootDirectory, ...storageKey.split("/"));
    expect(mkdir).toHaveBeenCalledWith(resolve(objectPath, ".."), {
      recursive: true,
    });
    expect(writeFile).toHaveBeenCalledWith(objectPath, content, { mode: 0o600 });
    expect(readFile).toHaveBeenCalledWith(objectPath);
    expect(result).toBe(content);
  });

  it("keeps deletion idempotent when the local object is already absent", async () => {
    (unlink as jest.Mock).mockRejectedValue(
      Object.assign(new Error("missing"), { code: "ENOENT" })
    );

    await expect(deletePrivateObject(storageKey)).resolves.toBeUndefined();
  });

  it("rejects traversal and unrecognized storage keys", () => {
    expect(() =>
      resolveFilesystemStorageRoot("public/private-attachments")
    ).toThrow(
      "ATTACHMENT_LOCAL_STORAGE_PATH must not be inside the public directory"
    );
    expect(() =>
      resolveFilesystemStoragePath(rootDirectory, "attachments/7/../../secret")
    ).toThrow("Invalid private attachment storage key");
    expect(() =>
      resolveFilesystemStoragePath(rootDirectory, "other/7/object")
    ).toThrow("Invalid private attachment storage key");
  });
});
