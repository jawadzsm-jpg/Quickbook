// Browser-side preparation of attachments before upload. Photos and scans (JPG, PNG, WebP) are scaled down to at most
// 2400 px on the longest side and re-encoded, so a 6 MB phone photo is usually stored at a few hundred KB. The smaller
// of the original and the compressed file is kept. Other files are compressed on the server (lib/attachments.ts).

export type PreparedAttachment = { fileName: string; mimeType: string; fileData: string; fileSize: number };

export const MAX_ATTACHMENT_SIZE = 3_000_000;
/** Images larger than the stored limit are accepted when compression brings them under it. */
export const MAX_IMAGE_SOURCE_SIZE = 25_000_000;
const MAX_DIMENSION = 2400;
const COMPRESSIBLE = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function compressImage(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    // PNGs may be transparent: WebP keeps transparency (browsers without WebP encoding return a PNG instead).
    if (file.type === "image/jpeg") { context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await encode(canvas, file.type === "image/jpeg" ? "image/jpeg" : "image/webp", 0.82);
  } catch {
    return null;
  }
}

function readAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(blob);
  });
}

function renamed(name: string, type: string) {
  const extension = EXTENSIONS[type];
  if (!extension) return name;
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "image"}.${extension}`;
}

/** The file ready to upload (compressed when smaller), or an error message when it is still too large. */
export async function prepareAttachment(file: File): Promise<PreparedAttachment | { error: string }> {
  if (!file.size) return { error: `${file.name} is empty.` };
  const compressible = COMPRESSIBLE.has(file.type);
  if (file.size > (compressible ? MAX_IMAGE_SOURCE_SIZE : MAX_ATTACHMENT_SIZE)) return { error: `${file.name} is larger than ${compressible ? "25" : "3"} MB.` };
  let blob: Blob = file;
  if (compressible && file.size > 150_000) {
    const compressed = await compressImage(file);
    if (compressed && COMPRESSIBLE.has(compressed.type) && compressed.size < file.size * 0.95) blob = compressed;
  }
  if (blob.size > MAX_ATTACHMENT_SIZE) return { error: `${file.name} is still larger than 3 MB after compression.` };
  const mimeType = blob.type || file.type || "application/octet-stream";
  return { fileName: blob === file ? file.name : renamed(file.name, mimeType), mimeType, fileSize: blob.size, fileData: await readAsDataUrl(blob) };
}
