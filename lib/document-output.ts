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

async function imageAsDataUrl(image: HTMLImageElement) {
  const source = image.currentSrc || image.src;
  if (!source || source.startsWith("data:") || source.startsWith("blob:")) return source;
  try {
    const response = await fetch(source, { credentials: "same-origin", cache: "force-cache" });
    if (!response.ok) throw new Error("Image fetch failed.");
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || source));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return new URL(source, window.location.href).href;
  }
}

function copyComputedStyles(source: Element, target: Element) {
  const computed = window.getComputedStyle(source);
  if (target instanceof HTMLElement || target instanceof SVGElement) {
    for (const property of Array.from(computed)) {
      target.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
    }
  }
  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);
  sourceChildren.forEach((child, index) => {
    const cloneChild = targetChildren[index];
    if (cloneChild) copyComputedStyles(child, cloneChild);
  });
}

async function renderElementToCanvas(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(Math.max(rect.width, element.scrollWidth)));
  const height = Math.max(1, Math.ceil(Math.max(rect.height, element.scrollHeight)));
  const clone = element.cloneNode(true) as HTMLElement;
  copyComputedStyles(element, clone);
  clone.style.width = `${width}px`;
  clone.style.maxWidth = "none";
  clone.style.height = "auto";
  clone.style.margin = "0";
  clone.style.transform = "none";
  clone.style.transformOrigin = "top left";
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");

  const sourceImages = Array.from(element.querySelectorAll("img"));
  const cloneImages = Array.from(clone.querySelectorAll("img"));
  await Promise.all(sourceImages.map(async (image, index) => {
    const clonedImage = cloneImages[index];
    if (!clonedImage) return;
    clonedImage.src = await imageAsDataUrl(image);
    clonedImage.removeAttribute("srcset");
    clonedImage.removeAttribute("sizes");
  }));

  const serialized = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="100%" height="100%">${serialized}</foreignObject></svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const rendered = new Image();
      rendered.onload = () => resolve(rendered);
      rendered.onerror = () => reject(new Error("Could not render the document preview."));
      rendered.src = url;
    });
    const maxArea = 28_000_000;
    const scale = Math.max(0.5, Math.min(2, Math.sqrt(maxArea / Math.max(1, width * height))));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create the PDF canvas.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function createA4PdfBlob(element: HTMLElement, options: PdfPageOptions = {}) {
  const { jsPDF } = await import("jspdf");
  const orientation = options.orientation === "landscape" ? "landscape" : "portrait";
  const margin = Math.max(0, Math.min(25, options.marginMm ?? 10));
  const canvas = await renderElementToCanvas(element);
  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
  pdf.setProperties({ title: options.title || "Document" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const printableWidth = Math.max(1, pageWidth - margin * 2);
  const printableHeight = Math.max(1, pageHeight - margin * 2);
  const ratio = Math.min(printableWidth / canvas.width, printableHeight / canvas.height);
  const imageWidth = canvas.width * ratio;
  const imageHeight = canvas.height * ratio;
  const x = margin + Math.max(0, (printableWidth - imageWidth) / 2);
  const y = margin;
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.97), "JPEG", x, y, imageWidth, imageHeight, undefined, "FAST");
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

export function openPdfBlob(blob: Blob, targetWindow: Window | null) {
  const url = URL.createObjectURL(blob);
  if (targetWindow && !targetWindow.closed) {
    targetWindow.location.href = url;
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
