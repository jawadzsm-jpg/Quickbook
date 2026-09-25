export type PdfPageOptions = {
  orientation?: "portrait" | "landscape";
  marginMm?: number;
  title?: string;
};

function cleanFilePart(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  const cleaned = text
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "");
  return cleaned || fallback;
}

export function documentPdfFileName(customerName: unknown, referenceNumber: unknown) {
  const customer = cleanFilePart(customerName, "Customer");
  const reference = cleanFilePart(referenceNumber, "Document");
  return `${customer}_${reference}.pdf`;
}

async function imageAsDataUrl(image: HTMLImageElement): Promise<string | null> {
  const source = image.currentSrc || image.src;
  if (!source) return null;
  if (source.startsWith("data:")) return source;
  try {
    const response = await fetch(source, { credentials: "same-origin", cache: "force-cache", mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function flattenImageDataUrl(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const loaded = new Image();
      loaded.onload = () => resolve(loaded);
      loaded.onerror = () => reject(new Error("Could not prepare the document logo."));
      loaded.src = dataUrl;
    });
    const width = Math.max(1, image.naturalWidth || image.width);
    const height = Math.max(1, image.naturalHeight || image.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return dataUrl;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.98);
  } catch {
    return dataUrl;
  }
}

function cssNumber(value: string, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cssColor(value: string): [number, number, number, number] | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "transparent") return null;
  const rgb = normalized.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
  if (rgb) {
    return [
      Math.max(0, Math.min(255, Math.round(Number(rgb[1])))),
      Math.max(0, Math.min(255, Math.round(Number(rgb[2])))),
      Math.max(0, Math.min(255, Math.round(Number(rgb[3])))),
      rgb[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(rgb[4]))),
    ];
  }
  const hex = normalized.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (hex) {
    const value6 = hex[1];
    return [
      Number.parseInt(value6.slice(0, 2), 16),
      Number.parseInt(value6.slice(2, 4), 16),
      Number.parseInt(value6.slice(4, 6), 16),
      hex[2] ? Number.parseInt(hex[2], 16) / 255 : 1,
    ];
  }
  return null;
}

function directText(element: HTMLElement) {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function visibleElement(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || cssNumber(style.opacity, 1) <= 0.01) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function imageFormat(dataUrl: string): "PNG" | "JPEG" | "WEBP" | null {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return null;
}

export async function createA4PdfBlob(element: HTMLElement, options: PdfPageOptions = {}) {
  const { jsPDF } = await import("jspdf");
  const orientation = options.orientation === "landscape" ? "landscape" : "portrait";
  const margin = Math.max(0, Math.min(25, options.marginMm ?? 10));
  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
  pdf.setProperties({ title: options.title || "Document" });

  const all = [element, ...Array.from(element.querySelectorAll<HTMLElement>("*"))]
    .filter((node) => !["SCRIPT", "STYLE", "NOSCRIPT"].includes(node.tagName))
    .filter(visibleElement);

  if (!all.length) throw new Error("Document preview is empty.");

  const rects = all.map((node) => node.getBoundingClientRect());
  const rootRect = element.getBoundingClientRect();
  const minLeft = Math.min(rootRect.left, ...rects.map((rect) => rect.left));
  const minTop = Math.min(rootRect.top, ...rects.map((rect) => rect.top));
  const maxRight = Math.max(rootRect.right, ...rects.map((rect) => rect.right));
  const maxBottom = Math.max(rootRect.bottom, ...rects.map((rect) => rect.bottom));
  const sourceWidth = Math.max(1, maxRight - minLeft);
  const sourceHeight = Math.max(1, maxBottom - minTop);

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const printableWidth = Math.max(1, pageWidth - margin * 2);
  const printableHeight = Math.max(1, pageHeight - margin * 2);
  const scale = Math.min(printableWidth / sourceWidth, printableHeight / sourceHeight);
  const offsetX = margin + Math.max(0, (printableWidth - sourceWidth * scale) / 2);
  const offsetY = margin;

  const xOf = (px: number) => offsetX + (px - minLeft) * scale;
  const yOf = (px: number) => offsetY + (px - minTop) * scale;

  // First pass: backgrounds and borders. This keeps the visible template geometry
  // without using a browser canvas, so cross-origin logos can never taint the export.
  for (const node of all) {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    const x = xOf(rect.left);
    const y = yOf(rect.top);
    const width = rect.width * scale;
    const height = rect.height * scale;

    const background = cssColor(style.backgroundColor);
    if (background && background[3] > 0.04) {
      pdf.setFillColor(background[0], background[1], background[2]);
      pdf.rect(x, y, width, height, "F");
    }

    const sides = [
      ["Top", x, y, x + width, y],
      ["Right", x + width, y, x + width, y + height],
      ["Bottom", x, y + height, x + width, y + height],
      ["Left", x, y, x, y + height],
    ] as const;
    for (const [side, x1, y1, x2, y2] of sides) {
      const borderStyle = style[`border${side}Style` as keyof CSSStyleDeclaration];
      const borderWidth = cssNumber(String(style[`border${side}Width` as keyof CSSStyleDeclaration]));
      const borderColor = cssColor(String(style[`border${side}Color` as keyof CSSStyleDeclaration]));
      if (borderStyle === "none" || borderWidth <= 0 || !borderColor || borderColor[3] <= 0.04) continue;
      pdf.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      pdf.setLineWidth(Math.max(0.08, borderWidth * scale));
      pdf.line(x1, y1, x2, y2);
    }
  }

  // Second pass: logos and other images. Images that cannot be read because of CORS
  // are skipped instead of aborting the entire PDF.
  const images = Array.from(element.querySelectorAll<HTMLImageElement>("img")).filter(visibleElement);
  for (const image of images) {
    const originalDataUrl = await imageAsDataUrl(image);
    if (!originalDataUrl) continue;
    const dataUrl = await flattenImageDataUrl(originalDataUrl);
    const format = imageFormat(dataUrl);
    if (!format) continue;
    const rect = image.getBoundingClientRect();
    try {
      pdf.addImage(dataUrl, format, xOf(rect.left), yOf(rect.top), rect.width * scale, rect.height * scale, undefined, "FAST");
    } catch {
      // Keep the rest of the document downloadable even if one image is unsupported.
    }
  }

  // Third pass: text. Drawing text directly into jsPDF avoids canvas security rules.
  for (const node of all) {
    const text = directText(node);
    if (!text) continue;
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const color = cssColor(style.color) || [17, 17, 17, 1];
    pdf.setTextColor(color[0], color[1], color[2]);

    const family = style.fontFamily.toLowerCase();
    const font = family.includes("georgia") || family.includes("times") ? "times" : family.includes("courier") || family.includes("mono") ? "courier" : "helvetica";
    const weight = style.fontWeight === "bold" || cssNumber(style.fontWeight) >= 600;
    const italic = style.fontStyle === "italic" || style.fontStyle === "oblique";
    const fontStyle = weight && italic ? "bolditalic" : weight ? "bold" : italic ? "italic" : "normal";
    pdf.setFont(font, fontStyle);

    const fontPx = Math.max(6, cssNumber(style.fontSize, 12));
    const fontPt = Math.max(4, fontPx * scale * 72 / 25.4);
    pdf.setFontSize(fontPt);

    const paddingLeft = cssNumber(style.paddingLeft);
    const paddingRight = cssNumber(style.paddingRight);
    const paddingTop = cssNumber(style.paddingTop);
    const maxWidth = Math.max(1, (rect.width - paddingLeft - paddingRight) * scale);
    const lines = pdf.splitTextToSize(text, maxWidth) as string[];
    const lineHeightPx = style.lineHeight === "normal" ? fontPx * 1.2 : Math.max(fontPx, cssNumber(style.lineHeight, fontPx * 1.2));
    const lineHeightMm = lineHeightPx * scale;
    const totalHeight = Math.max(fontPx * scale, lines.length * lineHeightMm);

    const align = style.textAlign === "center" ? "center" : style.textAlign === "right" || style.textAlign === "end" ? "right" : "left";
    const x = align === "center"
      ? xOf(rect.left + rect.width / 2)
      : align === "right"
        ? xOf(rect.right - paddingRight)
        : xOf(rect.left + paddingLeft);

    let y = yOf(rect.top + paddingTop) + fontPx * scale * 0.82;
    if (style.alignContent === "center" || style.verticalAlign === "middle") {
      y = yOf(rect.top) + Math.max(fontPx * scale * 0.82, (rect.height * scale - totalHeight) / 2 + fontPx * scale * 0.82);
    } else if (style.alignContent === "end" || style.verticalAlign === "bottom") {
      y = yOf(rect.bottom) - totalHeight + fontPx * scale * 0.82;
    }

    pdf.text(lines, x, y, { align, lineHeightFactor: Math.max(1, lineHeightPx / fontPx) });
  }

  return pdf.output("blob");
}

// Letterheads use an exact A4 canvas so the downloaded PDF has the same line
// wrapping, logo placement, and text position as the browser print preview.
export async function createA4LetterheadPdfBlob(element: HTMLElement, title: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const body = element.querySelector<HTMLElement>(".letterhead-body-text");
  const footerArea = element.querySelector<HTMLElement>(".letterhead-footer-area");
  const limit = footerArea?.getBoundingClientRect().top ?? element.getBoundingClientRect().bottom - 50;
  if (body && body.getBoundingClientRect().bottom > limit - 8) {
    throw new Error("The letter text extends beyond the A4 content area. Move or shorten it to fit the page.");
  }
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false,
    onclone: (document) => document.querySelectorAll(".letterhead-drag-handle").forEach((handle) => handle.remove()),
  });
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  pdf.setProperties({ title });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297);
  return pdf.output("blob");
}

export function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

export async function savePdfBlob(blob: Blob, filename: string) {
  const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
  if (!picker) {
    downloadPdfBlob(blob, filename);
    return;
  }
  try {
    const handle = await picker({
      suggestedName: filename,
      types: [{ description: "PDF document", accept: { "application/pdf": [".pdf"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    throw error;
  }
}

export function openPdfBlob(blob: Blob, targetWindow: Window | null) {
  const url = URL.createObjectURL(blob);
  if (targetWindow && !targetWindow.closed) {
    targetWindow.location.href = url;
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
