import type { PrintOrientation } from "./document-print";

export function reportStampPage(orientation: PrintOrientation) {
  return orientation === "landscape" ? { width: 297, height: 210, maxLeft: 242, maxTop: 160 } : { width: 210, height: 297, maxLeft: 155, maxTop: 250 };
}
export function moveReportStamp(orientation: PrintOrientation, left: number, top: number, deltaX: number, deltaY: number, previewWidth: number) {
  const page = reportStampPage(orientation), pixelsPerMm = Math.max(1, previewWidth) / page.width;
  return { left: Math.max(0, Math.min(page.maxLeft, Math.round(left + deltaX / pixelsPerMm))), top: Math.max(0, Math.min(page.maxTop, Math.round(top + deltaY / pixelsPerMm))) };
}
