import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getAttachmentConfig } from "@/lib/attachment-config";

let s3Client: S3Client | undefined;

function isPathInside(parent: string, candidate: string): boolean {
  const relativePath = relative(resolve(parent), resolve(candidate));
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) &&
      relativePath !== ".." &&
      !isAbsolute(relativePath))
  );
}

export function resolveFilesystemStorageRoot(rootDirectory: string): string {
  const root = resolve(rootDirectory);
  if (isPathInside(resolve(process.cwd(), "public"), root)) {
    throw new Error(
      "ATTACHMENT_LOCAL_STORAGE_PATH must not be inside the public directory"
    );
  }
  return root;
}

function getS3Client(): S3Client {
  if (s3Client) return s3Client;
  const { storage } = getAttachmentConfig();
  if (storage.driver !== "s3") {
    throw new Error("S3 client requested for non-S3 attachment storage");
  }
  s3Client = new S3Client({
    endpoint: storage.endpoint,
    region: storage.region,
    forcePathStyle: storage.forcePathStyle,
    credentials: storage.credentials,
  });
  return s3Client;
}

export function resolveFilesystemStoragePath(
  rootDirectory: string,
  storageKey: string
): string {
  if (!/^attachments\/(?:[1-9]\d*|legacy)\/[a-zA-Z0-9-]+$/.test(storageKey)) {
    throw new Error("Invalid private attachment storage key");
  }

  const root = resolveFilesystemStorageRoot(rootDirectory);
  const objectPath = resolve(root, ...storageKey.split("/"));
  if (!objectPath.startsWith(`${root}${sep}`)) {
    throw new Error("Attachment storage key escapes the private storage root");
  }
  return objectPath;
}

async function storeFilesystemObject(
  rootDirectory: string,
  storageKey: string,
  content: Buffer
): Promise<void> {
  const objectPath = resolveFilesystemStoragePath(rootDirectory, storageKey);
  await mkdir(dirname(objectPath), { recursive: true });
  await writeFile(objectPath, content, { mode: 0o600 });
}

async function deleteFilesystemObject(
  rootDirectory: string,
  storageKey: string
): Promise<void> {
  const objectPath = resolveFilesystemStoragePath(rootDirectory, storageKey);
  try {
    await unlink(objectPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function storePrivateObject(
  storageKey: string,
  content: Buffer,
  contentType: string,
  checksum: string
): Promise<void> {
  const { storage } = getAttachmentConfig();
  if (storage.driver === "filesystem") {
    await storeFilesystemObject(storage.rootDirectory, storageKey, content);
    return;
  }
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: storage.bucket,
      Key: storageKey,
      Body: content,
      ContentLength: content.length,
      ContentType: contentType,
      CacheControl: "no-store",
      Metadata: { sha256: checksum },
      ServerSideEncryption: "AES256",
    })
  );
}

export async function readPrivateObject(storageKey: string): Promise<Uint8Array> {
  const { storage } = getAttachmentConfig();
  if (storage.driver === "filesystem") {
    return readFile(
      resolveFilesystemStoragePath(storage.rootDirectory, storageKey)
    );
  }
  const result = await getS3Client().send(
    new GetObjectCommand({ Bucket: storage.bucket, Key: storageKey })
  );
  if (!result.Body) throw new Error("Stored attachment has no body");
  return result.Body.transformToByteArray();
}

export async function deletePrivateObject(storageKey: string): Promise<void> {
  const { storage } = getAttachmentConfig();
  if (storage.driver === "filesystem") {
    await deleteFilesystemObject(storage.rootDirectory, storageKey);
    return;
  }
  await getS3Client().send(
    new DeleteObjectCommand({ Bucket: storage.bucket, Key: storageKey })
  );
}

export function resetAttachmentStorageForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Attachment storage can only be reset in tests");
  }
  s3Client?.destroy();
  s3Client = undefined;
}
