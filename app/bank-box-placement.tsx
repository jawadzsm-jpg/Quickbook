"use client";

import { useRef } from "react";
import type { PrintOrientation } from "@/lib/document-print";
import { reportStampPage } from "@/lib/report-stamp";

export type BankBoxPlacementValue = { show: boolean; left: number; top: number; remark: string | null };
export const BANK_BOX_SIZE_MM = { width: 80, height: 40 };

/** Largest left/top (mm, from the printable area's top-left) that keeps the box on an A4 page with 10 mm margins. */
export function bankBoxLimits(orientation: PrintOrientation) {
  const page = reportStampPage(orientation);
  return { page, maxLeft: page.width - 20 - BANK_BOX_SIZE_MM.width, maxTop: page.height - 20 - BANK_BOX_SIZE_MM.height };
}

/** Escaped HTML for the bank details box, absolutely placed in a print page (position: relative). */
export function bankBoxHtml(lines: string[], remark: string, left: number, top: number, escape: (value: string) => string) {
  return `<div class="bank-details-box" style="position:absolute;left:${left}mm;top:${top}mm;width:${BANK_BOX_SIZE_MM.width}mm;padding:2mm;border:1px solid #94a3b8;border-radius:1mm;background:#fff;color:#0f172a;font:8pt/1.35 Arial,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;z-index:3"><div style="font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.8mm">Bank details</div>${lines.map((line) => `<div>${escape(line)}</div>`).join("")}${remark ? `<div style="margin-top:1mm;color:#b91c1c">${escape(remark)}</div>` : ""}</div>`;
}

/** Toggle, position and remark for the bank details box, with a draggable A4 position guide. */
export function BankBoxPlacement({ currency, lines, defaultRemark, orientation, value, onChange }: {
  currency: string; lines: string[] | null; defaultRemark: string; orientation: PrintOrientation;
  value: BankBoxPlacementValue; onChange: (value: BankBoxPlacementValue) => void;
}) {
  const { page, maxLeft, maxTop } = bankBoxLimits(orientation);
  const preview = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; width: number } | null>(null);
  const left = Math.max(0, Math.min(maxLeft, value.left)), top = Math.max(0, Math.min(maxTop, value.top));
  const remark = value.remark ?? defaultRemark;
  const set = (patch: Partial<BankBoxPlacementValue>) => onChange({ ...value, left, top, ...patch });
  const clampLeft = (next: number) => Math.max(0, Math.min(maxLeft, Math.round(next)));
  const clampTop = (next: number) => Math.max(0, Math.min(maxTop, Math.round(next)));
  return <section className="sales-stamp-settings print:hidden" aria-label="Bank details box placement">
    <div className="sales-stamp-controls">
      <div><h3>Bank details box</h3><p>Prints the {currency} bank account from Company Setup with its remark. Drag the box on the page guide or type its position.</p></div>
      <label className="sales-stamp-toggle"><input type="checkbox" disabled={!lines} checked={Boolean(lines) && value.show} onChange={(event) => set({ show: event.target.checked })} />Include bank details ({currency})</label>
      {!lines ? <p>Add a {currency} bank account in Company Setup → Bank account.</p> : value.show && <>
        <label>Left (mm)<input type="number" min="0" max={maxLeft} value={left} onChange={(event) => set({ left: clampLeft(Number(event.target.value) || 0) })} /></label>
        <label>Top (mm)<input type="number" min="0" max={maxTop} value={top} onChange={(event) => set({ top: clampTop(Number(event.target.value) || 0) })} /></label>
      </>}
    </div>
    {lines && value.show && <label className="grid gap-1 text-sm"><span className="font-medium">Remark on this document</span><textarea rows={2} maxLength={500} className="w-full rounded-md border bg-background px-3 py-2 text-foreground" value={remark} placeholder="Payment note, correspondent bank instructions…" onChange={(event) => set({ remark: event.target.value })} /></label>}
    {lines && value.show && <div className="sales-stamp-preview-wrap"><div className="sales-stamp-preview" ref={preview} style={{ aspectRatio: `${page.width} / ${page.height}` }}>
      <span>A4 {orientation} · {page.width} × {page.height} mm</span><div className="sales-stamp-preview-lines" aria-hidden="true" />
      <button type="button" aria-label="Move bank details box with arrow keys" className="layout-paper absolute cursor-move touch-none rounded-sm border border-slate-400 text-left text-[6px] leading-tight shadow-sm"
        style={{ left: `${(10 + left) / page.width * 100}%`, top: `${(10 + top) / page.height * 100}%`, width: `${BANK_BOX_SIZE_MM.width / page.width * 100}%`, height: `${BANK_BOX_SIZE_MM.height / page.height * 100}%`, padding: 2 }}
        onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); drag.current = { x: event.clientX, y: event.clientY, left, top, width: preview.current?.getBoundingClientRect().width ?? page.width }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => { const start = drag.current; if (!start) return; const perMm = start.width / page.width; set({ left: clampLeft(start.left + (event.clientX - start.x) / perMm), top: clampTop(start.top + (event.clientY - start.y) / perMm) }); }}
        onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={(event) => { const step = event.shiftKey ? 5 : 1; const delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[event.key]; if (delta) { event.preventDefault(); set({ left: clampLeft(left + delta[0]), top: clampTop(top + delta[1]) }); } }}>
        <strong className="block uppercase">Bank details</strong>{lines.slice(0, 4).map((line, index) => <span key={index} className="block truncate">{line}</span>)}
      </button>
    </div><p>Position guide. Print and PDF place the box at these millimetres on the first page.</p></div>}
  </section>;
}
