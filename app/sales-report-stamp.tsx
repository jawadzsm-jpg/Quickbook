"use client";

import { useRef, type CSSProperties } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { moveReportStamp, reportStampPage } from "@/lib/report-stamp";
import { PREVIEW_LAYOUT, stampPreviewLayout } from "@/lib/report-stamp-preview";
import type { PrintOrientation } from "@/lib/document-print";

type StampPosition = { show: boolean; left: number; top: number };

/** Real report content for the position guide: the page where the table ends is drawn from these rows. */
export type StampPagePreview = {
  title: string; subtitle?: string;
  summary: Array<{ label: string; value: string }>; note?: string;
  columns: string[]; rows: string[][];
  bankBoxes?: Array<{ title: string; lines: string[]; remark?: string; left: number }>;
};

export function SalesReportStamp({ stampData, orientation, value, onChange, preview: pagePreview }: { stampData: string; orientation: PrintOrientation; value: StampPosition; onChange: (value: StampPosition) => void; preview?: StampPagePreview }) {
  const page = reportStampPage(orientation);
  const preview = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; width: number } | null>(null);
  const x = (mm: number) => `${mm / page.width * 100}%`, y = (mm: number) => `${mm / page.height * 100}%`;
  const text = (mm: number): CSSProperties => ({ fontSize: `${mm * 100 / page.width}cqw`, lineHeight: 1.25 });
  const noteLines = pagePreview?.note ? Math.max(1, Math.ceil(pagePreview.note.length / (orientation === "landscape" ? 190 : 130))) : 0;
  const layout = pagePreview ? stampPreviewLayout({
    orientation, summaryCards: pagePreview.summary.length, noteLines, rows: pagePreview.rows.length, stampTop: value.top,
    boxes: (pagePreview.bankBoxes ?? []).map((box) => ({ lines: box.lines.length, remarkLines: box.remark ? Math.ceil(box.remark.length / 48) : 0 })),
  }) : null;
  const stampTop = layout ? layout.stamp.top : value.top;
  const L = PREVIEW_LAYOUT;
  return <section className={`sales-stamp-settings print:hidden${pagePreview ? " has-page-preview" : ""}`} aria-label="Company stamp placement">
    <div className="sales-stamp-controls"><div><h3>Company stamp</h3><p>Choose the stamp position. Print and PDF place it below the final table, moving it to a new page when needed.</p></div><label className="sales-stamp-toggle"><input type="checkbox" disabled={!stampData} checked={value.show} onChange={(event) => onChange({ ...value, show: event.target.checked })} />Include company stamp</label>
      {!stampData ? <p>Upload a stamp in Company Setup first.</p> : value.show && <><label>Left (mm)<input type="number" min="0" max={page.maxLeft} value={value.left} onChange={(event) => onChange({ ...value, left: Math.max(0, Math.min(page.maxLeft, Number(event.target.value) || 0)) })} /></label><label>Top (mm)<input type="number" min="0" max={page.maxTop} value={value.top} onChange={(event) => onChange({ ...value, top: Math.max(0, Math.min(page.maxTop, Number(event.target.value) || 0)) })} /></label><Button type="button" variant="outline" size="sm" onClick={() => onChange({ show: true, left: orientation === "landscape" ? 227 : 145, top: orientation === "landscape" ? 145 : 230 })}>Reset position</Button><p>Drag with mouse or touch, or select the stamp and use arrow keys. Hold Shift for 5 mm steps.</p></>}
    </div>
    {value.show && stampData && <div className="sales-stamp-preview-wrap"><div className="sales-stamp-preview" ref={preview} style={{ aspectRatio: `${page.width} / ${page.height}`, containerType: "inline-size" }}>
      {pagePreview && layout ? <div className="sales-stamp-page" aria-label={`Page ${layout.page} of the report, where the table ends`}>
        <div className="sales-stamp-page-header" style={{ height: y(L.headerHeight), padding: `${y(3)} ${x(12)}` }}>
          <div style={{ ...text(3.4), fontWeight: 700 }}>{pagePreview.subtitle}</div>
          <div style={{ ...text(4.6), fontWeight: 700, marginTop: y(1.5) }}>{pagePreview.title}</div>
          {layout.page > 1 ? <div style={{ ...text(2.4), marginTop: y(1.5), opacity: .75 }}>Page {layout.page} (continued)</div> : null}
        </div>
        {layout.showSummary && <>
          <div className="sales-stamp-page-abs" style={{ top: y(L.summaryTitleY - 3.5), left: 0, right: 0, textAlign: "center", ...text(3), fontWeight: 700 }}>Summary</div>
          {pagePreview.summary.map((card, index) => { const columns = Math.max(1, Math.min(3, pagePreview.summary.length)); const width = (page.width - 20 - 3 * (columns - 1)) / columns; return <div key={card.label} className="sales-stamp-page-abs sales-stamp-page-card" style={{ left: x(10 + (index % columns) * (width + 3)), top: y(L.cardsTop + Math.floor(index / columns) * L.cardRowHeight), width: x(width), height: y(15), padding: `${y(2)} ${x(2.5)}` }}><div style={{ ...text(2), fontWeight: 700, textTransform: "uppercase", opacity: .7 }}>{card.label}</div><div style={{ ...text(3), fontWeight: 700, marginTop: y(1) }}>{card.value}</div></div>; })}
          {pagePreview.note ? <div className="sales-stamp-page-abs" style={{ left: x(10), right: x(10), top: y(layout.noteTop - 2.5), ...text(2.2), opacity: .7, overflow: "hidden", maxHeight: y(noteLines * L.noteLineHeight + 1) }}>{pagePreview.note}</div> : null}
        </>}
        {layout.tableTop > 0 && <div className="sales-stamp-page-abs sales-stamp-page-table" style={{ left: x(10), right: x(10), top: y(layout.tableTop) }}>
          <div className="sales-stamp-page-row is-head" style={{ height: y(L.headRowHeight), ...text(2.4) }}>{pagePreview.columns.map((column) => <span key={column}>{column}</span>)}</div>
          {pagePreview.rows.slice(layout.firstRow, layout.lastRow).map((row, index) => <div key={layout.firstRow + index} className="sales-stamp-page-row" style={{ height: y(L.rowHeight), ...text(2.4) }}>{row.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}</div>)}
        </div>}
        {(pagePreview.bankBoxes ?? []).map((box, index) => layout.boxes[index] ? <div key={box.title} className="sales-stamp-page-abs sales-stamp-page-bank" style={{ left: x(10 + box.left), top: y(layout.boxes[index].top), width: x(L.boxWidth), height: y(layout.boxes[index].height), padding: `${y(1.5)} ${x(1.5)}`, ...text(2.3) }}><strong>{box.title.toUpperCase()}</strong>{box.lines.map((line) => <div key={line}>{line}</div>)}{box.remark ? <div style={{ color: "#b91c1c" }}>{box.remark}</div> : null}</div> : null)}
        {layout.stamp.moved && layout.page === 1 && layout.stamp.requestedTop < layout.stamp.top ? <div className="sales-stamp-page-abs sales-stamp-page-requested" title="Your chosen position overlaps the content" style={{ left: x(value.left), top: y(layout.stamp.requestedTop), width: x(32), height: y(23) }} /> : null}
      </div> : <><span>A4 {orientation} · {page.width} × {page.height} mm</span><div className="sales-stamp-preview-lines" aria-hidden="true" /></>}
      <button type="button" aria-label="Move company stamp with arrow keys" className="sales-stamp-preview-image" style={{ left: x(value.left), top: y(stampTop), width: x(32), height: y(23) }}
      onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); drag.current = { x: event.clientX, y: event.clientY, left: value.left, top: value.top, width: preview.current?.getBoundingClientRect().width ?? page.width }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { const start = drag.current; if (start) onChange({ show: true, ...moveReportStamp(orientation, start.left, start.top, event.clientX - start.x, event.clientY - start.y, start.width) }); }}
      onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drag.current = null; }}
      onKeyDown={(event) => { const step = event.shiftKey ? 5 : 1; const delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[event.key]; if (delta) { event.preventDefault(); onChange({ show: true, ...moveReportStamp(orientation, value.left, value.top, delta[0], delta[1], page.width) }); } }}>
      <Image src={stampData} alt="Company stamp" width={130} height={95} unoptimized draggable={false} /></button></div>
      {layout ? <p><strong>Page {layout.page} · stamp prints at {value.left} mm from the left, {Math.round(stampTop)} mm from the top.</strong> {layout.stamp.moved ? layout.page > 1 && layout.stamp.top === 46 ? "There is no room under the table, so the stamp starts a new page." : "Your chosen Top overlaps the table, so the stamp prints just below it (dashed outline = your chosen spot)." : "This is where the stamp prints."} Row heights are approximate.</p> : <p>Position guide only. The final stamp stays outside the table and above the page footer.</p>}
    </div>}
  </section>;
}
