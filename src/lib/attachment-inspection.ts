import { extname, basename } from "node:path";
import { validationError } from "@/lib/domain-error";
import { errors } from "@/lib/strings";

export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

type SupportedFile = {
  mediaType: string;
  matches: (content: Buffer) => boolean;
};

const startsWith = (signature: number[]) => (content: Buffer) =>
  content.subarray(0, signature.length).equals(Buffer.from(signature));

const isZip = (content: Buffer) =>
  startsWith([0x50, 0x4b, 0x03, 0x04])(content) ||
  startsWith([0x50, 0x4b, 0x05, 0x06])(content) ||
  startsWith([0x50, 0x4b, 0x07, 0x08])(content);

const hasZipEntry = (content: Buffer, prefix: string) =>
  isZip(content) && content.includes(Buffer.from(prefix, "utf8"));

const isPlainText = (content: Buffer) => {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(content);
    return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
  } catch {
    return false;
  }
};

const supportedFiles: Record<string, SupportedFile> = {
  ".jpg": { mediaType: "image/jpeg", matches: startsWith([0xff, 0xd8, 0xff]) },
  ".jpeg": { mediaType: "image/jpeg", matches: startsWith([0xff, 0xd8, 0xff]) },
  ".png": {
    mediaType: "image/png",
    matches: startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  ".gif": {
    mediaType: "image/gif",
    matches: (content) =>
      content.subarray(0, 6).toString("ascii") === "GIF87a" ||
      content.subarray(0, 6).toString("ascii") === "GIF89a",
  },
  ".webp": {
    mediaType: "image/webp",
    matches: (content) =>
      content.subarray(0, 4).toString("ascii") === "RIFF" &&
      content.subarray(8, 12).toString("ascii") === "WEBP",
  },
  ".pdf": {
    mediaType: "application/pdf",
    matches: (content) => content.subarray(0, 5).toString("ascii") === "%PDF-",
  },
  ".doc": {
    mediaType: "application/msword",
    matches: startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  },
  ".xls": {
    mediaType: "application/vnd.ms-excel",
    matches: startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  },
  ".docx": {
    mediaType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    matches: (content) => hasZipEntry(content, "word/"),
  },
  ".xlsx": {
    mediaType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    matches: (content) => hasZipEntry(content, "xl/"),
  },
  ".txt": { mediaType: "text/plain", matches: isPlainText },
  ".mp3": {
    mediaType: "audio/mpeg",
    matches: (content) =>
      content.subarray(0, 3).toString("ascii") === "ID3" ||
      (content[0] === 0xff && (content[1] & 0xe0) === 0xe0),
  },
  ".wav": {
    mediaType: "audio/wav",
    matches: (content) =>
      content.subarray(0, 4).toString("ascii") === "RIFF" &&
      content.subarray(8, 12).toString("ascii") === "WAVE",
  },
  ".ogg": {
    mediaType: "audio/ogg",
    matches: (content) => content.subarray(0, 4).toString("ascii") === "OggS",
  },
  ".mp4": {
    mediaType: "video/mp4",
    matches: (content) => content.subarray(4, 8).toString("ascii") === "ftyp",
  },
  ".webm": {
    mediaType: "video/webm",
    matches: startsWith([0x1a, 0x45, 0xdf, 0xa3]),
  },
};

function sanitizeFileName(fileName: string): string {
  const normalized = basename(fileName.normalize("NFKC"))
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
  if (!normalized || normalized === "." || normalized === "..") {
    throw validationError(errors.FILE_NAME_INVALID);
  }
  return normalized.slice(0, 255);
}

export function inspectAttachment(
  fileName: string,
  declaredMediaType: string,
  content: Buffer
) {
  if (content.length === 0) throw validationError(errors.FILE_EMPTY);
  if (content.length > MAX_ATTACHMENT_SIZE) {
    throw validationError(errors.FILE_TOO_LARGE);
  }

  const safeFileName = sanitizeFileName(fileName);
  const extension = extname(safeFileName).toLowerCase();
  const supportedFile = supportedFiles[extension];
  if (!supportedFile || !supportedFile.matches(content)) {
    throw validationError(errors.FILE_CONTENT_INVALID);
  }

  const normalizedDeclaredType = declaredMediaType.trim().toLowerCase();
  if (
    normalizedDeclaredType &&
    normalizedDeclaredType !== "application/octet-stream" &&
    normalizedDeclaredType !== supportedFile.mediaType
  ) {
    throw validationError(errors.FILE_CONTENT_INVALID);
  }

  return {
    fileName: safeFileName,
    fileSize: content.length,
    fileType: supportedFile.mediaType,
  };
}
