"use client";

import { useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { moveReportStamp, reportStampPage } from "@/lib/report-stamp";
import type { PrintOrientation } from "@/lib/document-print";

type StampPosition = { show: boolean; left: number; top: number };
export function SalesReportStamp({ stampData, orientation, value, onChange }: { stampData: string; orientation: PrintOrientation; value: StampPosition; onChange: (value: StampPosition) => void }) {
  const page = reportStampPage(orientation);
  const preview = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; width: number } | null>(null);
  return <section className="sales-stamp-settings print:hidden" aria-label="Company stamp placement">
    <div className="sales-stamp-controls"><div><h3>Company stamp</h3><p>Move the stamp on the A4 preview. Print and PDF use the same position.</p></div><label className="sales-stamp-toggle"><input type="checkbox" disabled={!stampData} checked={value.show} onChange={(event) => onChange({ ...value, show: event.target.checked })} />Include company stamp</label>
      {!stampData ? <p>Upload a stamp in Company Setup first.</p> : value.show && <><label>Left (mm)<input type="number" min="0" max={page.maxLeft} value={value.left} onChange={(event) => onChange({ ...value, left: Math.max(0, Math.min(page.maxLeft, Number(event.target.value) || 0)) })} /></label><label>Top (mm)<input type="number" min="0" max={page.maxTop} value={value.top} onChange={(event) => onChange({ ...value, top: Math.max(0, Math.min(page.maxTop, Number(event.target.value) || 0)) })} /></label><Button type="button" variant="outline" size="sm" onClick={() => onChange({ show: true, left: orientation === "landscape" ? 227 : 145, top: orientation === "landscape" ? 145 : 230 })}>Reset position</Button><p>Drag with mouse or touch, or select the stamp and use arrow keys. Hold Shift for 5 mm steps.</p></>}
    </div>
    {value.show && stampData && <div className="sales-stamp-preview-wrap"><div className="sales-stamp-preview" ref={preview} style={{ aspectRatio: `${page.width} / ${page.height}` }}><span>A4 {orientation} · {page.width} × {page.height} mm</span><div className="sales-stamp-preview-lines" aria-hidden="true" /><button type="button" aria-label="Move company stamp with arrow keys" className="sales-stamp-preview-image" style={{ left: `${value.left / page.width * 100}%`, top: `${value.top / page.height * 100}%`, width: `${32 / page.width * 100}%`, height: `${23 / page.height * 100}%` }}
      onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); drag.current = { x: event.clientX, y: event.clientY, left: value.left, top: value.top, width: preview.current?.getBoundingClientRect().width ?? page.width }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { const start = drag.current; if (start) onChange({ show: true, ...moveReportStamp(orientation, start.left, start.top, event.clientX - start.x, event.clientY - start.y, start.width) }); }}
      onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drag.current = null; }}
      onKeyDown={(event) => { const step = event.shiftKey ? 5 : 1; const delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[event.key]; if (delta) { event.preventDefault(); onChange({ show: true, ...moveReportStamp(orientation, value.left, value.top, delta[0], delta[1], page.width) }); } }}>
      <Image src={stampData} alt="Company stamp" width={130} height={95} unoptimized draggable={false} /></button></div><p>Preview shows position, not report content.</p></div>}
  </section>;
}
