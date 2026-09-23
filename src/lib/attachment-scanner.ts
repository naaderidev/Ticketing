import { createConnection } from "node:net";
import { getAttachmentConfig } from "@/lib/attachment-config";
import { validationError } from "@/lib/domain-error";
import { errors } from "@/lib/strings";

const SCAN_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 4_096;

async function scanWithClamAv(
  content: Buffer,
  host: string,
  port: number
): Promise<void> {
  const response = await new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host, port });
    const responseChunks: Buffer[] = [];
    let responseSize = 0;

    socket.setTimeout(SCAN_TIMEOUT_MS);
    socket.on("connect", () => {
      const length = Buffer.allocUnsafe(4);
      length.writeUInt32BE(content.length);
      socket.write(Buffer.from("zINSTREAM\0"));
      socket.write(length);
      socket.write(content);
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (chunk: Buffer) => {
      responseSize += chunk.length;
      if (responseSize > MAX_RESPONSE_BYTES) {
        socket.destroy(new Error("ClamAV response exceeded the safe limit"));
        return;
      }
      responseChunks.push(chunk);
    });
    socket.on("timeout", () => {
      socket.destroy(new Error("ClamAV scan timed out"));
    });
    socket.on("error", reject);
    socket.on("close", (hadError) => {
      if (!hadError) {
        resolve(Buffer.concat(responseChunks).toString("utf8").replace(/\0+$/, ""));
      }
    });
  });

  if (response.endsWith(" OK")) return;
  if (response.includes(" FOUND")) {
    throw validationError(errors.FILE_MALWARE_DETECTED);
  }
  throw new Error("ClamAV returned an unexpected scan result");
}

export async function scanAttachment(content: Buffer): Promise<void> {
  const { scanner } = getAttachmentConfig();
  if (scanner.mode === "disabled") return;
  await scanWithClamAv(content, scanner.host, scanner.port);
}
