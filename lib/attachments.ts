import { gunzipSync, gzipSync } from "node:zlib";

const allowedMimes = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "text/plain", "text/csv", "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "application/octet-stream",
]);
export const MAX_FILE_SIZE = 3_000_000;
export const MAX_FILES = 10;

export function parseAttachment(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const file = value as Record<string, unknown>;
  const fileName = String(file.fileName ?? "").trim();
  const mimeType = String(file.mimeType ?? "");
  const fileData = String(file.fileData ?? "");
  const fileSize = Number(file.fileSize);
  if (!fileName || fileName.length > 240 || /[\u0000-\u001f]/.test(fileName) || !allowedMimes.has(mimeType) || !Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) return null;
  const prefix = `data:${mimeType};base64,`;
  if (!fileData.startsWith(prefix) || fileData.length > prefix.length + 4 * Math.ceil(MAX_FILE_SIZE / 3)) return null;
  const encoded = fileData.slice(prefix.length);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return null;
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length !== fileSize || decoded.toString("base64") !== encoded) return null;
  return { fileName, mimeType, fileData, fileSize };
}

// Stored files: images arrive already compressed by the browser (lib/attachment-compress.ts). Other files (PDF, text,
// CSV, Word, Excel) are kept gzip-compressed when that saves at least 10%, as "gzip:data:<mime>;base64,<gzip bytes>".
const GZIP_PREFIX = "gzip:";
export function packAttachmentData(fileData: string) {
  if (fileData.startsWith("data:image/")) return fileData;
  const comma = fileData.indexOf(",");
  const raw = Buffer.from(fileData.slice(comma + 1), "base64");
  const packed = gzipSync(raw, { level: 9 });
  return packed.length <= raw.length * 0.9 ? `${GZIP_PREFIX}${fileData.slice(0, comma)},${packed.toString("base64")}` : fileData;
}

/** The original file bytes of a stored attachment (compressed or not). */
export function attachmentBytes(stored: string) {
  const compressed = stored.startsWith(GZIP_PREFIX);
  const bytes = Buffer.from(stored.slice(stored.indexOf(",") + 1), "base64");
  return compressed ? gunzipSync(bytes) : bytes;
}
